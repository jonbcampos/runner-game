/**
 * All sound in the game, synthesized at runtime. No audio files.
 *
 * Every effect is a few oscillators and an envelope, which keeps the game a
 * single 25 kB download and means sounds are tuned by editing numbers rather
 * than by opening an audio editor. It also suits the art direction — these are
 * meant to sound like a machine, not like recordings.
 *
 * Two mobile-specific rules drive the structure:
 *  - The AudioContext can't exist until a user gesture, so it's created lazily
 *    on the first input rather than at startup.
 *  - A context can get suspended when the app is backgrounded, so every sound
 *    checks and resumes rather than silently failing forever after.
 */

export type Sfx =
  | 'jump'
  | 'shoot'
  | 'slide'
  | 'hit'
  | 'kill'
  | 'death'
  | 'sector'
  | 'select';

const MUTE_KEY = 'ellies-rainbow-run.muted';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  muted: boolean;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.01);
    }
    return this.muted;
  }

  /** Call from a real user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoise(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(sfx: Sfx): void {
    if (this.muted || !this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const t = this.ctx.currentTime;

    switch (sfx) {
      case 'jump':
        // Quick upward chirp. Rising pitch reads as "up" without any thought.
        this.tone('square', 300, 620, t, 0.1, 0.22);
        break;
      case 'shoot':
        // Short downward zap with a noise transient for bite.
        this.tone('square', 900, 340, t, 0.07, 0.14);
        this.noise(t, 0.04, 0.08, 2200);
        break;
      case 'slide':
        // Filtered noise sweep — friction, not a tone.
        this.noise(t, 0.22, 0.16, 1400, 380);
        break;
      case 'hit':
        // Low and ugly. Should feel like a mistake.
        this.tone('sawtooth', 220, 70, t, 0.28, 0.3);
        this.noise(t, 0.16, 0.22, 900);
        break;
      case 'kill':
        // Bright burst, clearly a reward and clearly not a 'hit'.
        this.tone('square', 520, 900, t, 0.07, 0.16);
        this.noise(t, 0.12, 0.14, 3000, 600);
        break;
      case 'death':
        // Long descending slide: the run is over, and it sounds final.
        this.tone('sawtooth', 420, 50, t, 0.7, 0.32);
        this.noise(t, 0.4, 0.18, 1200, 200);
        break;
      case 'sector':
        // Two rising notes. Escalation you can hear before you feel it.
        this.tone('triangle', 660, 660, t, 0.12, 0.2);
        this.tone('triangle', 880, 880, t + 0.12, 0.18, 0.2);
        break;
      case 'select':
        this.tone('square', 520, 700, t, 0.06, 0.16);
        break;
    }
  }

  /** Pitch-swept oscillator with a percussive envelope. */
  private tone(
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    start: number,
    duration: number,
    peak: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, start);
    if (toHz !== fromHz) osc.frequency.exponentialRampToValueAtTime(Math.max(1, toHz), start + duration);

    // Fast attack, exponential decay. A linear fade sounds like a synthesizer;
    // an exponential one sounds like something was struck.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Band-limited noise burst, optionally sweeping the filter. */
  private noise(
    start: number,
    duration: number,
    peak: number,
    filterFrom: number,
    filterTo?: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuffer) return;

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    if (filterTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(1, filterTo), start + duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  /** One second of white noise, reused by every noise-based effect. */
  private createNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
