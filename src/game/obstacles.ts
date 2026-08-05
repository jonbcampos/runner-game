import { GROUND_Y, OBSTACLE, SCREEN } from './config';
import type { Aabb } from './collision';

/** One family per verb. See OBSTACLE in config.ts for why the sizes are what they are. */
export type ObstacleKind = 'spike' | 'beam' | 'drone';

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  prevX: number;
  y: number;
  w: number;
  h: number;
  /** Infinity for terrain that can't be destroyed. */
  hp: number;
  active: boolean;
  /** Counts down after being shot, for a white flash. */
  hitFlash: number;
  /** Counts up while dying, for the death animation. */
  deathTimer: number;
}

/** The verb that beats each family. Used by the HUD tutorial and the M3 director. */
export const SOLVED_BY: Record<ObstacleKind, 'jump' | 'slide' | 'shoot'> = {
  spike: 'jump',
  beam: 'slide',
  drone: 'shoot',
};

const POOL_SIZE = 24;

export class ObstacleField {
  readonly items: Obstacle[] = [];

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.items.push({
        kind: 'spike',
        x: 0,
        prevX: 0,
        y: 0,
        w: 0,
        h: 0,
        hp: Infinity,
        active: false,
        hitFlash: 0,
        deathTimer: 0,
      });
    }
  }

  spawn(kind: ObstacleKind, x: number): Obstacle | null {
    const item = this.items.find((o) => !o.active);
    if (!item) return null;

    item.kind = kind;
    item.x = x;
    item.prevX = x;
    item.active = true;
    item.hitFlash = 0;
    item.deathTimer = 0;

    switch (kind) {
      case 'spike':
        item.w = OBSTACLE.spike.width;
        item.h = OBSTACLE.spike.height;
        item.y = GROUND_Y - item.h;
        item.hp = Infinity;
        break;
      case 'beam':
        item.w = OBSTACLE.beam.width;
        item.h = OBSTACLE.beam.height;
        item.y = GROUND_Y - OBSTACLE.beam.clearance - item.h;
        item.hp = Infinity;
        break;
      case 'drone':
        item.w = OBSTACLE.drone.width;
        item.h = OBSTACLE.drone.height;
        item.y = GROUND_Y - OBSTACLE.drone.bottomGap - item.h;
        item.hp = OBSTACLE.drone.hp;
        break;
    }
    return item;
  }

  update(dt: number, scrollSpeed: number): void {
    for (const item of this.items) {
      if (!item.active) continue;

      item.prevX = item.x;
      item.x -= scrollSpeed * dt;

      if (item.hitFlash > 0) item.hitFlash -= dt;

      if (item.deathTimer > 0) {
        item.deathTimer -= dt;
        if (item.deathTimer <= 0) item.active = false;
        continue;
      }

      // Cull once fully off the left edge.
      if (item.x + item.w < -8) item.active = false;
    }
  }

  /** Mark as destroyed and start the death animation. */
  kill(item: Obstacle): void {
    item.hp = 0;
    item.deathTimer = 0.18;
  }

  /** Destroyed obstacles still render (briefly) but no longer hurt the player. */
  static isHazardous(item: Obstacle): boolean {
    return item.active && item.deathTimer <= 0;
  }

  static isShootable(item: Obstacle): boolean {
    return Number.isFinite(item.hp);
  }

  static box(item: Obstacle, out: Aabb): Aabb {
    out.x = item.x;
    out.y = item.y;
    out.w = item.w;
    out.h = item.h;
    return out;
  }

  reset(): void {
    for (const item of this.items) item.active = false;
  }

  /** X coordinate just off the right edge — where new obstacles enter. */
  static get spawnX(): number {
    return SCREEN.w + 16;
  }
}
