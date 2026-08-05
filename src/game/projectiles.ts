import { SHOT, VIRTUAL_W } from './config';
import type { Aabb } from './collision';

export interface Shot {
  x: number;
  y: number;
  prevX: number;
  active: boolean;
}

/**
 * Fixed-size pool of projectiles.
 *
 * Nothing here is allocated after startup. Games run a hot loop 60+ times a
 * second; allocating a bullet object per shot and letting it fall out of scope
 * hands the garbage collector a steady drip of work, which surfaces as a
 * periodic frame hitch. On a mid-range Android phone that hitch is exactly
 * long enough to make you miss a jump. Pools are how you avoid it.
 */
export class ShotPool {
  readonly shots: Shot[] = [];

  constructor() {
    for (let i = 0; i < SHOT.poolSize; i++) {
      this.shots.push({ x: 0, y: 0, prevX: 0, active: false });
    }
  }

  spawn(x: number, y: number): void {
    for (const shot of this.shots) {
      if (shot.active) continue;
      shot.x = x;
      shot.y = y;
      shot.prevX = x;
      shot.active = true;
      return;
    }
    // Pool exhausted. Silently dropping the shot is correct here: the pool is
    // sized well above what the fire rate can produce, so this can't happen in
    // normal play, and stealing the oldest shot would look worse than nothing.
  }

  update(dt: number): void {
    for (const shot of this.shots) {
      if (!shot.active) continue;
      shot.prevX = shot.x;
      shot.x += SHOT.speed * dt;
      if (shot.x > VIRTUAL_W + SHOT.width) shot.active = false;
    }
  }

  reset(): void {
    for (const shot of this.shots) shot.active = false;
  }

  static box(shot: Shot, out: Aabb): Aabb {
    out.x = shot.x;
    out.y = shot.y;
    out.w = SHOT.width;
    out.h = SHOT.height;
    return out;
  }
}
