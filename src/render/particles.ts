import { GROUND_Y } from '../game/config';
import { PALETTE, alpha } from './palette';

/**
 * Pooled particle system.
 *
 * Particles exist to make cause and effect legible: you can see the shot
 * connect, see the drone come apart, see your feet hit the ground. Without
 * them, hits register as things simply vanishing.
 *
 * Nothing is allocated after construction — same reasoning as the shot pool.
 * A steady drip of short-lived objects is exactly what produces periodic GC
 * hitches, and a hitch during a jump is a death.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  color: string;
  /** World-anchored particles scroll with the level; sparks fly free. */
  anchored: boolean;
  active: boolean;
}

const POOL_SIZE = 140;

export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push({
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 1, gravity: 0,
        color: PALETTE.shot, anchored: false, active: false,
      });
    }
  }

  /**
   * Take the next slot, recycling the oldest if the pool is full.
   * Overwriting beats dropping: a missing burst is more noticeable than one
   * that ends a few milliseconds early.
   */
  private take(): Particle {
    const particle = this.pool[this.cursor]!;
    this.cursor = (this.cursor + 1) % POOL_SIZE;
    return particle;
  }

  private spawn(
    x: number, y: number, vx: number, vy: number,
    life: number, size: number, color: string,
    gravity: number, anchored: boolean,
  ): void {
    const p = this.take();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life; p.size = size;
    p.color = color; p.gravity = gravity; p.anchored = anchored;
    p.active = true;
  }

  /** Sparks off a shot connecting, thrown back toward the player. */
  shotImpact(x: number, y: number, random: () => number): void {
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI + (random() - 0.5) * 1.6;
      const speed = 60 + random() * 90;
      this.spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        0.2 + random() * 0.12, 2, PALETTE.shot, 260, false);
    }
  }

  /** A drone coming apart: hot sparks plus slower tumbling debris. */
  droneDeath(x: number, y: number, random: () => number): void {
    for (let i = 0; i < 14; i++) {
      const angle = random() * Math.PI * 2;
      const speed = 50 + random() * 160;
      this.spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        0.3 + random() * 0.3, 2 + Math.floor(random() * 2),
        random() < 0.5 ? PALETTE.drone : PALETTE.shot, 320, false);
    }
    for (let i = 0; i < 5; i++) {
      const angle = random() * Math.PI * 2;
      this.spawn(x, y, Math.cos(angle) * 40, Math.sin(angle) * 40 - 30,
        0.5 + random() * 0.3, 3, PALETTE.droneShield, 200, false);
    }
  }

  /** Dust on landing. Anchored, so it stays where the feet actually hit. */
  landing(x: number, random: () => number): void {
    for (let i = 0; i < 6; i++) {
      this.spawn(x + (random() - 0.5) * 12, GROUND_Y - 1,
        (random() - 0.5) * 70, -20 - random() * 30,
        0.25 + random() * 0.15, 2, PALETTE.groundLine, 120, true);
    }
  }

  /** Friction sparks trailing a slide. */
  slideSpark(x: number, random: () => number): void {
    this.spawn(x, GROUND_Y - 2, -60 - random() * 70, -30 - random() * 40,
      0.18 + random() * 0.12, 2, PALETTE.player, 240, true);
  }

  /** Burst when the player dies. */
  playerDeath(x: number, y: number, random: () => number): void {
    for (let i = 0; i < 20; i++) {
      const angle = random() * Math.PI * 2;
      const speed = 70 + random() * 190;
      this.spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        0.4 + random() * 0.4, 2 + Math.floor(random() * 3),
        random() < 0.6 ? PALETTE.spike : PALETTE.player, 340, false);
    }
  }

  update(dt: number, scrollSpeed: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.anchored) p.x -= scrollSpeed * dt;
      // Anchored particles skid along the floor rather than falling through it.
      if (p.anchored && p.y > GROUND_Y) {
        p.y = GROUND_Y;
        p.vy *= -0.3;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      // Fade out over the particle's life so nothing pops out of existence.
      const fade = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = alpha(p.color, fade);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
  }

  reset(): void {
    for (const p of this.pool) p.active = false;
  }
}
