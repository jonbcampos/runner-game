import { synth, type SfxKind } from './sfx';

/**
 * All sound in the game: synthesised effects, plus optional voices and music.
 *
 * Rebuilt in ../slingshot's shape (its decisions 16 and 18):
 *
 *  - **Effects are synthesised sample by sample** (`sfx.ts`), a few cached
 *    random variants each, slightly re-pitched every time.
 *  - **Everything goes through a compressor and a short procedural reverb**, so
 *    every sound sits in the same open meadow and a busy moment stays punchy
 *    instead of clipping.
 *  - **Voices and music are optional files** from `npm run sound`. No index, or
 *    a file that fails, and the game plays with its synthesised sounds alone.
 *  - **One voice at a time, and voices duck the music.**
 *  - **Music loops seamlessly** from the steady part of each Lyria clip, and
 *    tracks crossfade when the wanted one changes.
 *
 * And two mobile rules from the original (decision 21) still drive the shape:
 * the AudioContext can't exist until a user gesture, and a backgrounded app
 * can have its context suspended, so every play checks and resumes.
 *
 * SOUND and MUSIC are muted separately and both are remembered: a parent may
 * well want the beeps without the tune, or the reverse.
 */

export type Sfx = SfxKind;

const MUTE_KEY = 'ellies-rainbow-run.muted';
const MUSIC_KEY = 'ellies-rainbow-run.music-muted';

/** Music sits well under everything else: the effects are the information. */
const MUSIC_LEVEL = 0.26;
const MUSIC_FADE = 1.4;
const LOOP_XFADE = 1.5;
const MASTER = 0.9;

/** Per-effect level and reverb send. */
const MIX: Record<SfxKind, { gain: number; reverb: number }> = {
  step: { gain: 0.09, reverb: 0 },
  jump: { gain: 0.32, reverb: 0.1 },
  land: { gain: 0.3, reverb: 0.05 },
  slide: { gain: 0.32, reverb: 0.08 },
  zap: { gain: 0.22, reverb: 0.2 },
  clink: { gain: 0.3, reverb: 0.25 },
  pop: { gain: 0.5, reverb: 0.35 },
  twinkle: { gain: 0.18, reverb: 0.4 },
  chime: { gain: 0.45, reverb: 0.4 },
  bonk: { gain: 0.5, reverb: 0.15 },
  gameover: { gain: 0.5, reverb: 0.45 },
  sector: { gain: 0.35, reverb: 0.4 },
  select: { gain: 0.3, reverb: 0.2 },
  expire: { gain: 0.25, reverb: 0.3 },
  'boss-pop': { gain: 0.7, reverb: 0.5 },
};
const VARIANTS = 3;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Private mode: the toggle still works for this session.
  }
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicOut: GainNode | null = null;
  private reverbSend: GainNode | null = null;

  /** Effects and voices. */
  muted: boolean;
  /** Music only. */
  musicMuted: boolean;

  constructor() {
    this.muted = readFlag(MUTE_KEY);
    this.musicMuted = readFlag(MUSIC_KEY);
    // A backgrounded tab gets its context suspended by the browser anyway;
    // doing it ourselves means the music is genuinely silent behind the lock
    // screen, and resuming on return means it's never silent forever after.
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeFlag(MUTE_KEY, this.muted);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER, this.ctx.currentTime, 0.01);
    }
    return this.muted;
  }

  toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    writeFlag(MUSIC_KEY, this.musicMuted);
    if (this.musicOut && this.ctx) {
      this.musicOut.gain.setTargetAtTime(this.musicMuted ? 0 : 1, this.ctx.currentTime, 0.15);
    }
    return this.musicMuted;
  }

  /** Call from a real user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      this.master.connect(comp);

      // A short, soft outdoor reverb, shared by every effect.
      const reverb = ctx.createConvolver();
      reverb.buffer = this.makeReverb(ctx);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.9;
      this.reverbSend.connect(reverb);
      reverb.connect(this.master);

      // Music: bus (ducked by voices) -> out (the MUSIC toggle) -> comp. Music
      // bypasses `master` so muting SOUND leaves the tune playing, and vice versa.
      this.musicOut = ctx.createGain();
      this.musicOut.gain.value = this.musicMuted ? 0 : 1;
      this.musicOut.connect(comp);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_LEVEL;
      this.musicBus.connect(this.musicOut);

      this.decodeAll();
      // Build each effect's first variant now, a few ms apart, so the first
      // jump doesn't hitch while it's being synthesised.
      (Object.keys(MIX) as SfxKind[]).forEach((kind, i) =>
        setTimeout(() => this.variant(kind), 30 * (i + 1)),
      );
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  /** `level` 0..1 scales the volume; `rate` re-pitches. */
  play(sfx: Sfx, level = 1, rate = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (this.muted || !ctx || !master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const mix = MIX[sfx];
    const source = ctx.createBufferSource();
    source.buffer = this.variant(sfx);
    source.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = mix.gain * Math.max(0, Math.min(1.5, level));
    source.connect(g);
    g.connect(master);
    if (this.reverbSend && mix.reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = mix.reverb;
      g.connect(send);
      send.connect(this.reverbSend);
    }
    source.start();
  }

  private readonly sfx = new Map<SfxKind, AudioBuffer[]>();

  /** One of a few cached random renders of an effect, building more as needed. */
  private variant(kind: SfxKind): AudioBuffer {
    const ctx = this.ctx!;
    let variants = this.sfx.get(kind);
    if (!variants) {
      variants = [];
      this.sfx.set(kind, variants);
    }
    if (variants.length < VARIANTS) {
      const data = synth(kind, ctx.sampleRate);
      const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buffer.getChannelData(0).set(data);
      variants.push(buffer);
      return buffer;
    }
    return variants[Math.floor(Math.random() * variants.length)]!;
  }

  // --- Recorded sound: voices and music (scripts/generate-sound.mjs) -----------
  //
  // Fetched at startup but only DECODED once the AudioContext exists, which is
  // after the first tap.

  private readonly raw = new Map<string, ArrayBuffer>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly rates = new Map<string, number>();
  private voiceUntil = 0;
  private music: { id: string; gain: GainNode; sources: AudioBufferSourceNode[]; nextAt: number } | null = null;
  private wantMusic = '';
  private readonly loops = new Map<string, { start: number; end: number }>();

  /** Fetch the recorded sounds. Never throws; anything missing just stays silent. */
  loadRecorded(baseUrl: string): void {
    void (async () => {
      let index: { ext?: string; voices?: string[]; music?: string[]; rates?: Record<string, number> };
      try {
        const r = await fetch(`${baseUrl}sounds/index.json`, { cache: 'no-cache' });
        if (!r.ok) return;
        index = await r.json();
      } catch {
        return;
      }
      const ext = index.ext ?? 'm4a';
      for (const [id, rate] of Object.entries(index.rates ?? {})) this.rates.set(id, rate);
      // Voices first: they're small and used from the first second.
      for (const id of [...(index.voices ?? []), ...(index.music ?? [])]) {
        try {
          const r = await fetch(`${baseUrl}sounds/${id}.${ext}`);
          if (r.ok) this.raw.set(id, await r.arrayBuffer());
        } catch {
          // One missing file loses one sound.
        }
        if (this.ctx) this.decodeAll();
      }
    })();
  }

  private decodeAll(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [id, bytes] of this.raw) {
      this.raw.delete(id);
      void ctx.decodeAudioData(bytes).then(
        (buffer) => this.buffers.set(id, buffer),
        () => {},
      );
    }
  }

  /** True if this recorded sound is ready to play. */
  has(id: string): boolean {
    return this.buffers.has(id);
  }

  /** True while a voice line is still being spoken. */
  get talking(): boolean {
    return !!this.ctx && this.ctx.currentTime < this.voiceUntil;
  }

  /**
   * Say a voice line, one of `ids` at random. Returns false if nothing was
   * said (none loaded, muted, or someone is already talking).
   */
  say(ids: readonly string[], opts: { delay?: number; gain?: number; interrupt?: boolean } = {}): boolean {
    const ctx = this.ctx;
    if (this.muted || !ctx || !this.master) return false;
    const ready = ids.filter((id) => this.buffers.has(id));
    if (ready.length === 0) return false;
    const at = ctx.currentTime + (opts.delay ?? 0);
    if (at < this.voiceUntil && !opts.interrupt) return false;
    const id = ready[Math.floor(Math.random() * ready.length)]!;
    const buffer = this.buffers.get(id)!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const rate = (this.rates.get(id) ?? 1) * (0.97 + Math.random() * 0.06);
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = opts.gain ?? 1;
    source.connect(gain);
    gain.connect(this.master);
    source.start(at);
    this.voiceUntil = at + buffer.duration / rate;
    this.duck(0.5, buffer.duration / rate, at);
    return true;
  }

  /** Ask for a music track. Crossfades if it's different; `''` fades music out. */
  setMusic(id: string): void {
    this.wantMusic = id;
  }

  get currentMusic(): string {
    return this.music?.id ?? '';
  }

  /**
   * Keep the music going. Call every frame: it starts, crossfades and loops
   * tracks by scheduling the next segment a little ahead of time.
   */
  updateMusic(): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const want = this.wantMusic && this.buffers.has(this.wantMusic) ? this.wantMusic : '';
    const now = ctx.currentTime;

    if (this.music && this.music.id !== want) {
      const old = this.music;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0.0001, now + MUSIC_FADE);
      for (const src of old.sources) {
        try {
          src.stop(now + MUSIC_FADE + 0.05);
        } catch {
          // Already stopped.
        }
      }
      this.music = null;
    }
    if (!want) return;
    if (!this.music) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1, now + MUSIC_FADE);
      gain.connect(bus);
      this.music = { id: want, gain, sources: [], nextAt: now };
    }
    const m = this.music;
    if (m.nextAt - now > 2) return;
    const buffer = this.buffers.get(m.id)!;
    const loop = this.loopOf(m.id, buffer);
    const length = loop.end - loop.start;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const seg = ctx.createGain();
    // Each segment fades in and out over the crossfade, so the overlap blends.
    const t0 = Math.max(now, m.nextAt);
    seg.gain.setValueAtTime(0.0001, t0);
    seg.gain.linearRampToValueAtTime(1, t0 + LOOP_XFADE);
    seg.gain.setValueAtTime(1, t0 + length - LOOP_XFADE);
    seg.gain.linearRampToValueAtTime(0.0001, t0 + length);
    source.connect(seg);
    seg.connect(m.gain);
    source.start(t0, loop.start, length);
    m.sources = [...m.sources.slice(-2), source];
    m.nextAt = t0 + length - LOOP_XFADE;
  }

  /**
   * The steady part of a track: from where it reaches full volume to where it
   * starts to fade. Lyria clips are ~30 s and often fade at the end; looping
   * the whole thing would dip to silence every lap.
   */
  private loopOf(id: string, buffer: AudioBuffer): { start: number; end: number } {
    const cached = this.loops.get(id);
    if (cached) return cached;
    const data = buffer.getChannelData(0);
    const win = Math.floor(buffer.sampleRate * 0.1);
    const rms: number[] = [];
    for (let i = 0; i + win <= data.length; i += win) {
      let sum = 0;
      for (let j = i; j < i + win; j++) sum += data[j]! * data[j]!;
      rms.push(Math.sqrt(sum / win));
    }
    const sorted = [...rms].sort((a, b) => a - b);
    const level = (sorted[sorted.length >> 1] ?? 0) * 0.6;
    let first = rms.findIndex((v) => v >= level);
    let last = rms.length - 1 - [...rms].reverse().findIndex((v) => v >= level);
    if (first < 0 || last <= first) {
      first = 0;
      last = rms.length - 1;
    }
    let start = Math.min(first * 0.1, 4);
    let end = (last + 1) * 0.1;
    if (end - start < 8) {
      start = 0;
      end = buffer.duration;
    }
    const loop = { start, end };
    this.loops.set(id, loop);
    return loop;
  }

  /** Dip the music, for a voice line, then bring it back. */
  duck(to: number, seconds: number, at?: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const t = at ?? ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setTargetAtTime(MUSIC_LEVEL * to, t, 0.05);
    bus.gain.setTargetAtTime(MUSIC_LEVEL, t + seconds, 0.4);
  }

  /** A short stereo outdoor reverb: decaying noise, darkening as it fades. */
  private makeReverb(ctx: AudioContext): AudioBuffer {
    const seconds = 1.4;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buffer.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const a = 0.5 * (1 - t) + 0.03;
        lp += ((Math.random() * 2 - 1) - lp) * a;
        d[i] = lp * Math.pow(1 - t, 3) * 0.5;
      }
    }
    return buffer;
  }
}
