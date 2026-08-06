import { SCREEN } from '../game/config';
import { alpha } from './palette';

/**
 * Fireworks over the night sky.
 *
 * Purely decorative, and shared by every theme, because "it's night" is a
 * property of the environment rather than of the art style.
 *
 * **No state and no allocation.** Each shell's whole life is a pure function of
 * the clock: shell `i` launches every `period` seconds, and where it is in its
 * arc is just the fractional part. That means no pool to manage, no update tick
 * to thread through the renderer, and nothing to reset between runs — and it
 * cannot drift out of sync with the simulation, because it isn't simulating
 * anything.
 *
 * **The one rule they obey:** they stay in the top of the frame, well above the
 * lane anything is answered in, they're small, and the sparks fade fast. A
 * bright thing arriving from off-screen is the game's entire vocabulary for
 * "deal with me", and a firework that read as a hazard — or worse, as a pickup
 * worth chasing — would be a genuinely cruel piece of decoration.
 */

const SHELLS = 7;
const COLOURS = ['#ff8fae', '#fff06a', '#8fe08f', '#7fc7ff', '#c79bff', '#ffffff'];

/** Lowest a burst is allowed to happen. The castle's roof reaches y≈128. */
const BURST_FLOOR = 92;

export function drawFireworks(ctx: CanvasRenderingContext2D, time: number, intensity: number): void {
  if (intensity <= 0.02) return;

  for (let i = 0; i < SHELLS; i++) {
    // Coprime-ish periods so the shells never settle into a visible rhythm.
    const period = 2.4 + (i % 3) * 0.6 + i * 0.11;
    const phase = (time + i * 1.37) / period;
    const launch = Math.floor(phase);
    const p = phase - launch;

    const seed = hash(launch * 31 + i * 7919);
    const x = 34 + (seed % Math.max(1, SCREEN.w - 68));
    const burstY = 26 + ((seed >>> 7) % (BURST_FLOOR - 26));
    const colour = COLOURS[(seed >>> 3) % COLOURS.length]!;

    if (p < 0.3) {
      // Climbing. A short trail rather than a dot, so the eye follows it up.
      const t = p / 0.3;
      const from = BURST_FLOOR + 74;
      const y = from + (burstY - from) * ease(t);
      ctx.fillStyle = alpha(colour, 0.85 * intensity);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
      ctx.fillStyle = alpha(colour, 0.3 * intensity);
      ctx.fillRect(Math.round(x), Math.round(y) + 3, 1, 5);
      continue;
    }

    // Bursting. Sparks fly out, slow down, and sag under their own weight.
    const t = (p - 0.3) / 0.7;
    // Holds its brightness through the first half and then goes quickly. A
    // square falloff was the first thing tried and it read as a dotted ring
    // rather than an explosion — a firework is mostly bright.
    const fade = Math.pow(1 - t, 1.5);
    if (fade <= 0.02) continue;
    const radius = 4 + ease(t) * 34;
    const sag = t * t * 15;

    // Two rings at different radii and offset angles. One ring reads as a
    // circle drawn on the sky; two read as a shell full of stars.
    for (let ring = 0; ring < 2; ring++) {
      const points = ring === 0 ? 14 : 9;
      const scale = ring === 0 ? 1 : 0.58;
      const size = ring === 0 ? 2 : 3;
      ctx.fillStyle = alpha(ring === 0 ? colour : '#ffffff', fade * intensity * (ring ? 0.7 : 1));
      for (let s = 0; s < points; s++) {
        const angle = (s / points) * Math.PI * 2 + (seed % 10) * 0.1 + ring * 0.4;
        const reach = radius * scale * (0.78 + ((seed >>> (s % 12)) & 7) * 0.04);
        const sx = x + Math.cos(angle) * reach;
        const sy = burstY + Math.sin(angle) * reach * 0.85 + sag;
        ctx.fillRect(Math.round(sx), Math.round(sy), size, size);
        // A short tail pointing back at the centre, so each spark has a
        // direction — that's what makes it look like it was thrown.
        if (ring === 0 && t < 0.55) {
          ctx.fillRect(
            Math.round(sx - Math.cos(angle) * 3),
            Math.round(sy - Math.sin(angle) * 3 * 0.85),
            1,
            1,
          );
        }
      }
    }

    // The flash, which is what sells the bang.
    if (t < 0.22) {
      const flash = 1 - t / 0.22;
      ctx.fillStyle = alpha('#ffffff', flash * intensity);
      ctx.fillRect(Math.round(x) - 3, Math.round(burstY) - 3, 7, 7);
      ctx.fillStyle = alpha(colour, flash * 0.5 * intensity);
      ctx.fillRect(Math.round(x) - 7, Math.round(burstY) - 7, 15, 15);
    }
  }
}

/** Fast out, slow in — a shell decelerating as it reaches its apex. */
function ease(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0;
  x ^= x >>> 15;
  return Math.imul(x, 2246822519) >>> 0;
}
