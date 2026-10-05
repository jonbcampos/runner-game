/**
 * Sound effects, synthesised sample by sample.
 *
 * Ported in approach from ../slingshot (its decision 16): the first set of
 * sounds here was one oscillator and one noise burst per effect, which reads
 * as "a game from 1985". These are built the way the real sounds work instead:
 *
 *  - **Bells and sparkles are several inharmonic partials** that ring and die
 *    at different rates (modal synthesis), so a chime shimmers instead of
 *    beeping.
 *  - **Springs wobble**: the jump is a pitch glide with a decaying vibrato,
 *    the cartoon "boing".
 *  - **Friction is filtered noise** whose band sweeps, so the slide swishes.
 *  - **Footsteps are tiny low thuds**, quiet enough to be felt rather than
 *    heard: a patter under the music, not a metronome on top of it.
 *
 * Each function returns raw samples for a sample rate and is pure apart from
 * `Math.random`. The Audio class caches a few random variants of each, so a
 * run of identical events never sounds like a loop.
 */

export type SfxKind =
  | 'step'
  | 'jump'
  | 'land'
  | 'slide'
  | 'zap'
  | 'clink'
  | 'pop'
  | 'twinkle'
  | 'chime'
  | 'bonk'
  | 'gameover'
  | 'sector'
  | 'select'
  | 'expire'
  | 'boss-pop';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export function synth(kind: SfxKind, sr: number): Float32Array {
  switch (kind) {
    case 'step':
      return step(sr);
    case 'jump':
      return boing(sr);
    case 'land':
      return thud(sr);
    case 'slide':
      return swish(sr);
    case 'zap':
      return zap(sr);
    case 'clink':
      return modal(sr, 0.35, rnd(1900, 2300), [1, 2.32, 4.25, 6.63], [14, 18, 24, 30], 0.12, 7000);
    case 'pop':
      return pop(sr);
    case 'twinkle':
      return arpeggio(sr, [1568, 2093], 0.07, 0.5, 0.6);
    case 'chime':
      return arpeggio(sr, [784, 988, 1175, 1568], 0.075, 0.9, 1);
    case 'bonk':
      return bonk(sr);
    case 'gameover':
      return arpeggio(sr, [784, 659, 523, 392], 0.2, 1.3, 1, true);
    case 'sector':
      return arpeggio(sr, [1047, 1568], 0.12, 0.8, 1);
    case 'select':
      return arpeggio(sr, [1175], 0, 0.25, 0.7);
    case 'expire':
      return arpeggio(sr, [988, 740], 0.09, 0.4, 0.6);
    case 'boss-pop':
      return bossPop(sr);
  }
}

// --- Building blocks -------------------------------------------------------------

function buffer(sr: number, seconds: number): Float32Array {
  return new Float32Array(Math.floor(sr * seconds));
}

/** Scale so the loudest sample is `peak`. Every effect lands at the same level. */
function normalise(out: Float32Array, peak = 0.9): Float32Array {
  let max = 1e-6;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]!));
  const k = peak / max;
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * k;
  return out;
}

/** A one-pole low-pass, run in place. `cutoff` may be a function of time. */
function lowpass(x: Float32Array, sr: number, cutoff: number | ((t: number) => number)): Float32Array {
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const fc = typeof cutoff === 'number' ? cutoff : cutoff(i / sr);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    y += (x[i]! - y) * a;
    x[i] = y;
  }
  return x;
}

/** A struck object: a click to excite it, then several damped sine partials. */
function modal(
  sr: number,
  seconds: number,
  f: number,
  ratios: number[],
  decays: number[],
  noise: number,
  bright: number,
): Float32Array {
  const out = buffer(sr, seconds);
  const amps = ratios.map((_, i) => rnd(0.6, 1) / (i + 1));
  const phases = ratios.map(() => rnd(0, Math.PI * 2));
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let k = 0; k < ratios.length; k++) {
      s += amps[k]! * Math.exp(-decays[k]! * t) * Math.sin(2 * Math.PI * f * ratios[k]! * t + phases[k]!);
    }
    out[i] = s;
  }
  const hit = buffer(sr, seconds);
  for (let i = 0; i < hit.length; i++) hit[i] = (Math.random() * 2 - 1) * Math.exp((-i / sr) * 90);
  lowpass(hit, sr, bright);
  for (let i = 0; i < out.length; i++) out[i] = out[i]! + hit[i]! * noise * 3;
  return normalise(out);
}

/** One bell note added into `out` at `start` seconds: inharmonic partials, the upper ones dying first. */
function bell(out: Float32Array, sr: number, start: number, f: number, amp: number, length: number): void {
  const ratios = [1, 2.01, 3.0, 4.18, 5.43];
  const decays = [5, 7, 10, 14, 20].map((d) => d / length);
  const from = Math.floor(start * sr);
  for (let i = from; i < out.length; i++) {
    const t = (i - from) / sr;
    let s = 0;
    for (let k = 0; k < ratios.length; k++) {
      s += (Math.exp(-decays[k]! * t) * Math.sin(2 * Math.PI * f * ratios[k]! * t)) / (k + 1.4);
    }
    // A 3 ms attack, so the note starts with a soft "ting" rather than a click.
    out[i] = out[i]! + s * amp * Math.min(1, t * 330);
  }
}

/**
 * A run of bell notes. The sparkle and chime sounds are all this, at different
 * speeds and lengths. `soft` rounds them off for the game-over tune.
 */
function arpeggio(sr: number, notes: number[], gap: number, length: number, amp: number, soft = false): Float32Array {
  const out = buffer(sr, gap * notes.length + length + 0.1);
  const detune = rnd(0.985, 1.015);
  notes.forEach((f, i) => bell(out, sr, i * gap, f * detune, amp * (1 - i * 0.06), length));
  if (soft) lowpass(out, sr, 2600);
  return normalise(out, 0.8);
}

// --- Movement ------------------------------------------------------------------

/** A sneaker on grass: a tiny low thud with a whisper of noise. */
function step(sr: number): Float32Array {
  const out = buffer(sr, 0.07);
  let phase = 0;
  let n = 0;
  const f0 = rnd(110, 150);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * (f0 * (0.6 + 0.4 * Math.exp(-t * 60)))) / sr;
    n += ((Math.random() * 2 - 1) - n) * 0.3;
    out[i] = Math.sin(phase) * Math.exp(-t * 55) + n * Math.exp(-t * 90) * 0.6;
  }
  lowpass(out, sr, 1400);
  return normalise(out, 0.7);
}

/** The cartoon spring: a gliding sine with a decaying wobble, and a breath of air. */
function boing(sr: number): Float32Array {
  const out = buffer(sr, 0.32);
  let phase = 0;
  const base = rnd(240, 280);
  let air = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = base * (1 + t * 5.2) * (1 + 0.12 * Math.sin(2 * Math.PI * 22 * t) * Math.exp(-t * 6));
    phase += (2 * Math.PI * f) / sr;
    air += ((Math.random() * 2 - 1) - air) * 0.15;
    const env = Math.min(1, t * 200) * Math.exp(-t * 9);
    out[i] = (Math.sin(phase) + 0.25 * Math.sin(phase * 2)) * env + air * Math.exp(-t * 14) * 0.5;
  }
  return normalise(out, 0.8);
}

/** Landing: a soft low thump, like a small jump onto grass. */
function thud(sr: number): Float32Array {
  const out = buffer(sr, 0.18);
  let phase = 0;
  let n = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * (60 + 70 * Math.exp(-t * 30))) / sr;
    n += ((Math.random() * 2 - 1) - n) * 0.1;
    out[i] = Math.sin(phase) * Math.exp(-t * 22) + n * Math.exp(-t * 40) * 1.6;
  }
  return normalise(out, 0.8);
}

/** Sliding on grass: noise through a band that sweeps down as she slows. */
function swish(sr: number): Float32Array {
  const out = buffer(sr, 0.38);
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const fc = 600 + 2600 * Math.exp(-t * 6);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    lp += ((Math.random() * 2 - 1) - lp) * a;
    hp += (lp - hp) * 0.04;
    const env = Math.min(1, t * 40) * Math.exp(-t * 6);
    out[i] = (lp - hp) * env;
  }
  return normalise(out, 0.7);
}

// --- Magic -------------------------------------------------------------------------

/** The sparkle shot: a quick falling chirp with a glassy shimmer over it. */
function zap(sr: number): Float32Array {
  const out = buffer(sr, 0.2);
  let phase = 0;
  const top = rnd(2300, 2700);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = 700 + (top - 700) * Math.exp(-t * 28);
    phase += (2 * Math.PI * f) / sr;
    out[i] = Math.sin(phase) * Math.exp(-t * 26) * 0.7;
  }
  bell(out, sr, 0.005, rnd(3000, 3400), 0.35, 0.18);
  return normalise(out, 0.75);
}

/** A cloud cheered up: a soft poof and a rising three-note sparkle. */
function pop(sr: number): Float32Array {
  const out = buffer(sr, 0.75);
  let n = 0;
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    n += ((Math.random() * 2 - 1) - n) * 0.35;
    phase += (2 * Math.PI * (180 * Math.exp(-t * 18) + 60)) / sr;
    out[i] = n * Math.exp(-t * 35) * 1.1 + Math.sin(phase) * Math.exp(-t * 25) * 0.6;
  }
  const root = rnd(0.97, 1.03);
  [1319, 1661, 1976].forEach((f, k) => bell(out, sr, 0.04 + k * 0.055, f * root, 0.45, 0.45));
  return normalise(out, 0.85);
}

/** A bump: a woodblock "bonk" and a little slide-whistle wobble down. Never a crash. */
function bonk(sr: number): Float32Array {
  const out = modal(sr, 0.5, rnd(520, 580), [1, 2.7], [40, 70], 0.25, 3000);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const f = 700 * Math.exp(-t * 2.4) * (1 + 0.06 * Math.sin(2 * Math.PI * 9 * t));
    phase += (2 * Math.PI * f) / sr;
    out[i] = out[i]! * 0.7 + Math.sin(phase) * Math.min(1, t * 60) * Math.exp(-t * 5) * 0.45;
  }
  return normalise(out, 0.8);
}

/** The Storm King cheered up: a big soft poof and a long rising sparkle run. */
function bossPop(sr: number): Float32Array {
  const out = buffer(sr, 1.6);
  let n = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    n += ((Math.random() * 2 - 1) - n) * 0.08;
    out[i] = n * Math.min(1, t * 80) * Math.exp(-t * 5) * 2.5;
  }
  [784, 988, 1175, 1568, 1976, 2349].forEach((f, k) => bell(out, sr, 0.1 + k * 0.08, f, 0.5, 0.8));
  return normalise(out, 0.9);
}
