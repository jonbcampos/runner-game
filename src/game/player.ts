import { GROUND_Y, PLAYER, PLAYER_X, jumpAirtimeAt } from './config';
import type { Aabb } from './collision';
import type { Input } from '../core/input';

export type PlayerPose = 'run' | 'air' | 'slide' | 'dead';

export interface ShotRequest {
  x: number;
  y: number;
}

/**
 * How long a slide lasts at a given scroll speed, so that it always covers
 * PLAYER.slideDistance pixels of ground. See the comment on slideDistance.
 */
export function slideDurationAt(scrollSpeed: number): number {
  const raw = PLAYER.slideDistance / Math.max(scrollSpeed, 1);
  return Math.min(PLAYER.slideMaxDuration, Math.max(PLAYER.slideMinDuration, raw));
}

/**
 * Solve the jump arc for a given scroll speed.
 *
 * Given a target apex height and a rise/fall time split, the kinematics fall
 * straight out: apex = v0 * riseTime / 2, and g = v0 / riseTime. Rise and fall
 * get separate gravities so the descent can be faster than the ascent.
 */
export function solveJumpArc(scrollSpeed: number): {
  velocity: number;
  gravityUp: number;
  gravityDown: number;
} {
  const airtime = jumpAirtimeAt(scrollSpeed);
  const riseTime = airtime * PLAYER.jumpRiseFraction;
  const fallTime = airtime - riseTime;
  const velocity = (2 * PLAYER.jumpApex) / riseTime;
  return {
    velocity,
    gravityUp: velocity / riseTime,
    gravityDown: (2 * PLAYER.jumpApex) / (fallTime * fallTime),
  };
}

/**
 * The player's state machine and physics.
 *
 * Almost everything in here that isn't Newton's laws exists to make the
 * controls feel honest. Those forgiveness mechanics — coyote time, input
 * buffering, jump cut — are invisible when they work and are the entire
 * difference between "tight" and "this game keeps eating my inputs".
 */
export class Player {
  /** Y of the player's feet. The ground plane, when grounded. */
  feetY = GROUND_Y;
  /** Previous tick's feetY, so the renderer can interpolate between steps. */
  prevFeetY = GROUND_Y;
  vy = 0;

  pose: PlayerPose = 'run';
  grounded = true;

  /**
   * One-shot flags for things that happened during the last update, so the
   * caller can turn them into sound and particles. Reset at the top of each
   * update rather than by the reader, so a missed read can't leak into the
   * next frame and fire a sound twice.
   */
  justJumped = false;
  justSlid = false;
  justLanded = false;

  hp = 1;
  maxHp = 1;

  private coyote = 0;
  private slideTimer = 0;
  /** Remaining minimum slide time; a release before this is ignored. */
  private slideHoldFloor = 0;
  private slideCooldownTimer = 0;
  private shotCooldownTimer = 0;
  private invulnTimer = 0;
  /** True once the current jump's rise has been cut short by releasing early. */
  private jumpCut = false;

  /**
   * Gravity for the arc currently in progress. Captured at takeoff and held for
   * the whole jump, so a mid-air speed change (a sector boundary, say) can't
   * warp an arc the player has already committed to.
   */
  private gravityUp = 0;
  private gravityDown = 0;

  reset(hp: number, scrollSpeed: number): void {
    this.feetY = GROUND_Y;
    this.prevFeetY = GROUND_Y;
    this.vy = 0;
    this.pose = 'run';
    this.grounded = true;
    this.hp = hp;
    this.maxHp = hp;
    this.coyote = PLAYER.coyoteTime;
    this.slideTimer = 0;
    this.slideHoldFloor = 0;
    this.slideCooldownTimer = 0;
    this.shotCooldownTimer = 0;
    this.invulnTimer = 0;
    this.jumpCut = false;
    const arc = solveJumpArc(scrollSpeed);
    this.gravityUp = arc.gravityUp;
    this.gravityDown = arc.gravityDown;
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  get sliding(): boolean {
    return this.slideTimer > 0;
  }

  get dead(): boolean {
    return this.pose === 'dead';
  }

  /**
   * Advance one fixed step. Returns a shot to spawn this tick, or null.
   * The player doesn't own the projectile pool — it just reports intent, which
   * keeps this file free of any dependency on the rest of the world.
   */
  update(dt: number, input: Input, scrollSpeed: number): ShotRequest | null {
    this.prevFeetY = this.feetY;
    this.justJumped = false;
    this.justSlid = false;
    this.justLanded = false;

    if (this.pose === 'dead') {
      this.applyGravity(dt);
      this.integrate(dt);
      return null;
    }

    this.tickTimers(dt);

    // --- Slide ---------------------------------------------------------
    // Slide is ground-only. A slide pressed in mid-air stays in the input
    // buffer and fires the instant you land, which is what the player meant.
    if (this.slideTimer <= 0 && this.grounded && this.slideCooldownTimer <= 0) {
      if (input.consume('slide')) {
        this.slideTimer = slideDurationAt(scrollSpeed);
        this.slideHoldFloor = PLAYER.slideMinHold;
        this.pose = 'slide';
        this.justSlid = true;
      }
    }
    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      if (this.slideHoldFloor > 0) this.slideHoldFloor -= dt;

      // Hold-to-continue: letting go stands you back up, once the minimum has
      // elapsed. The cap still guarantees a fully-held slide clears a beam;
      // ending it early is the player's call, and their risk.
      const released = !input.down.slide && this.slideHoldFloor <= 0;
      if (released || this.slideTimer <= 0) {
        this.endSlide();
      }
    }

    // --- Jump ----------------------------------------------------------
    // Legal while grounded OR within the coyote window after walking off an
    // edge. Jumping also cancels a slide, so you're never locked in place.
    const canJump = this.grounded || this.coyote > 0;
    if (canJump && input.consume('jump')) {
      // Solve the arc for the speed the world is moving at right now, so this
      // jump covers the same ground it would at any other speed.
      const arc = solveJumpArc(scrollSpeed);
      this.gravityUp = arc.gravityUp;
      this.gravityDown = arc.gravityDown;
      this.vy = -arc.velocity;
      this.grounded = false;
      this.coyote = 0;
      this.jumpCut = false;
      this.justJumped = true;
      // Jumping cancels a slide outright, and deliberately without starting the
      // re-slide cooldown: slide, jump out, slide again on landing is a real
      // move, and charging it a cooldown would punish the better player.
      this.slideTimer = 0;
      this.slideHoldFloor = 0;
    }

    // Variable jump height: releasing the button while still rising cuts the
    // remaining upward velocity, turning one button into a range of heights.
    if (!this.jumpCut && this.vy < 0 && !input.down.jump) {
      this.vy *= PLAYER.jumpCutMultiplier;
      this.jumpCut = true;
    }

    // --- Shoot ---------------------------------------------------------
    // A fresh press fires immediately; holding auto-fires at the cooldown rate.
    let shot: ShotRequest | null = null;
    const wantsToShoot = input.consume('shoot') || input.down.shoot;
    if (wantsToShoot && this.shotCooldownTimer <= 0) {
      this.shotCooldownTimer = PLAYER.shotCooldown;
      shot = {
        x: PLAYER_X + PLAYER.muzzleX,
        y:
          this.feetY -
          (this.sliding ? PLAYER.slideHeight : PLAYER.height) +
          (this.sliding ? PLAYER.muzzleYSlide : PLAYER.muzzleYStand),
      };
    }

    this.applyGravity(dt);
    this.integrate(dt);
    this.updatePose();
    return shot;
  }

  /** Stand back up and start the re-slide cooldown. */
  private endSlide(): void {
    this.slideTimer = 0;
    this.slideHoldFloor = 0;
    this.slideCooldownTimer = PLAYER.slideCooldown;
  }

  private tickTimers(dt: number): void {
    if (this.slideCooldownTimer > 0) this.slideCooldownTimer -= dt;
    if (this.shotCooldownTimer > 0) this.shotCooldownTimer -= dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (!this.grounded && this.coyote > 0) this.coyote -= dt;
  }

  private applyGravity(dt: number): void {
    // Separate rise and fall gravities — see jumpRiseFraction in config.
    this.vy += (this.vy > 0 ? this.gravityDown : this.gravityUp) * dt;
  }

  private integrate(dt: number): void {
    this.feetY += this.vy * dt;

    // A corpse falls through the floor. Without this the body lands and sticks,
    // and since the run ends when it drops off the bottom of the screen, the
    // game-over state is never reached and the player is stuck in a dead run.
    if (this.pose === 'dead') return;

    if (this.feetY >= GROUND_Y) {
      this.feetY = GROUND_Y;
      if (!this.grounded) {
        this.grounded = true;
        this.jumpCut = false;
        this.justLanded = true;
      }
      this.vy = 0;
      this.coyote = PLAYER.coyoteTime;
    } else {
      this.grounded = false;
    }
  }

  private updatePose(): void {
    if (this.pose === 'dead') return;
    if (this.sliding) this.pose = 'slide';
    else if (!this.grounded) this.pose = 'air';
    else this.pose = 'run';
  }

  /** @returns true if the hit actually landed (i.e. not ignored by i-frames). */
  takeHit(): boolean {
    if (this.invulnTimer > 0 || this.pose === 'dead') return false;
    this.hp -= 1;
    this.invulnTimer = PLAYER.invulnDuration;
    if (this.hp <= 0) {
      this.hp = 0;
      this.pose = 'dead';
      // A visible pop on death — the body reacts instead of just stopping.
      this.vy = -PLAYER.deathPopVelocity;
      this.grounded = false;
      this.slideTimer = 0;
    }
    return true;
  }

  /** Visual box, in virtual pixels. Interpolated for rendering when alpha is given. */
  bounds(out: Aabb, alpha = 1): Aabb {
    const feet = this.prevFeetY + (this.feetY - this.prevFeetY) * alpha;
    const sliding = this.sliding;
    out.w = sliding ? PLAYER.slideWidth : PLAYER.width;
    out.h = sliding ? PLAYER.slideHeight : PLAYER.height;
    // The left edge is fixed, so sliding extends the player *forward*. That's a
    // real tradeoff rather than a free dodge: you duck the beam, but your nose
    // reaches further into whatever is coming next.
    out.x = PLAYER_X;
    out.y = feet - out.h;
    return out;
  }
}
