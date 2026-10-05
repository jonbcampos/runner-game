import { OBSTACLE } from '../game/config';
import type { Particles } from './particles';

/**
 * Presentation-only animation state: squash and stretch, reaction timers, and
 * a small fixed pool of effects (sparkle pops, cheered-up clouds).
 *
 * It lives in `src/render/` and is fed from main.ts's event handler, exactly
 * like the particles, so `src/game/` still has no idea any of it exists and
 * `verify()` can't be affected by it. Nothing here allocates after startup.
 *
 * Timers count UP in seconds since the thing happened (Infinity = never), so a
 * reader asks "how long ago?" and picks its own window, and nobody has to
 * remember to reset anything.
 */

export interface Fx {
  kind: 'pop' | 'happy';
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  /** Which happy-cloud frame, chosen at spawn so it doesn't flicker. */
  frame: number;
  active: boolean;
}

const FX_POOL = 24;

export const juice = {
  /** Render clock, seconds. Keeps running on the title screen, unlike `state.elapsed`. */
  time: 0,
  sinceJump: Infinity,
  sinceLand: Infinity,
  sinceShot: Infinity,
  sinceHit: Infinity,
  sinceCheer: Infinity,
  sinceBossDie: Infinity,
  /** Distance at which the last footfall dust/sound happened. */
  lastFootfall: 0,
  fx: Array.from({ length: FX_POOL }, (): Fx => ({
    kind: 'pop', x: 0, y: 0, age: 0, life: 1, size: 1, frame: 0, active: false,
  })),
  cursor: 0,
  /** Dev: outline hitboxes over the art (`__game.art.hitboxes()`). */
  showHitboxes: false,
  particles: null as Particles | null,
  /** Set by main.ts: a hazard was cleared without being touched (a sound, maybe a word). */
  onCleared: null as ((kind: 'spike' | 'beam') => void) | null,
};

/** Advance clocks and effects. `scroll` is the world's speed, so effects stay put in the world. */
export function updateJuice(dt: number, scroll: number): void {
  juice.time += dt;
  juice.sinceJump += dt;
  juice.sinceLand += dt;
  juice.sinceShot += dt;
  juice.sinceHit += dt;
  juice.sinceCheer += dt;
  juice.sinceBossDie += dt;
  for (const f of juice.fx) {
    if (!f.active) continue;
    f.age += dt;
    f.x -= scroll * dt;
    if (f.kind === 'happy') f.y -= 26 * dt;
    if (f.age >= f.life) f.active = false;
  }
}

export function resetJuice(): void {
  juice.sinceJump = juice.sinceLand = juice.sinceShot = Infinity;
  juice.sinceHit = juice.sinceCheer = juice.sinceBossDie = Infinity;
  juice.lastFootfall = 0;
  for (const f of juice.fx) f.active = false;
}

function spawnFx(kind: Fx['kind'], x: number, y: number, life: number, size: number, frame = 0): void {
  const f = juice.fx[juice.cursor]!;
  juice.cursor = (juice.cursor + 1) % FX_POOL;
  f.kind = kind;
  f.x = x;
  f.y = y;
  f.age = 0;
  f.life = life;
  f.size = size;
  f.frame = frame;
  f.active = true;
}

/** A rainbow sparkle pop (the flipbook when there's art; particles always). */
export function pop(x: number, y: number, size: number, random: () => number): void {
  spawnFx('pop', x, y, 0.5, size);
  juice.particles?.sparkle(x, y, random, 10, 60 + size);
}

/** A shot cloud cheers up: it turns white and happy and floats away. */
export function cheerUpCloud(x: number, y: number, random: () => number): void {
  spawnFx('happy', x, y, 0.9, OBSTACLE.drone.width + 6, random() < 0.5 ? 0 : 1);
  pop(x, y, 34, random);
}
