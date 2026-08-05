import { GROUND_Y, PLAYER, PLAYER_X, POWERUP, jumpAirtimeAt } from './config';
import type { Aabb } from './collision';
import type { Input } from '../core/input';

export type PlayerPose = 'run' | 'air' | 'slide' | 'fly' | 'dead';

/**
 * Powerup-driven modifiers, passed in each tick.
 *
 * The player doesn't own or know about powerups — it's told what its body can
 * currently do. That keeps the state machine readable and means a new powerup
 * is a new field here rather than new branches scattered through the physics.
 */
export interface PlayerMods {
  /** Multiplies jump apex. HIGH JUMP raises it. */
  jumpApexScale: number;
  /** Scales how long the ascent takes. Below 1 snaps upward faster. */
  jumpRiseScale: number;
  /** Scales the gap between shots. Below 1 fires faster. */
  shotCooldownScale: number;
  /** AUTOFIRE: keep shooting with no button held. */
  autoFire: boolean;
  /** FLIGHT: vertical control replaces the jump arc entirely. */
  flying: boolean;
}

export const NO_MODS: PlayerMods = {
  jumpApexScale: 1,
  jumpRiseScale: 1,
  shotCooldownScale: 1,
  autoFire: false,
  flying: false,
};

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
export function solveJumpArc(
  scrollSpeed: number,
  apexScale = 1,
  riseScale = 1,
): { velocity: number; gravityUp: number; gravityDown: number } {
  const apex = PLAYER.jumpApex * apexScale;
  // Airtime grows with the square root of height, not linearly — a taller jump
  // that kept the same airtime would need violent gravity and feel wrong.
  const airtime = jumpAirtimeAt(scrollSpeed) * Math.sqrt(apexScale);
  const riseTime = airtime * PLAYER.jumpRiseFraction * riseScale;
  const fallTime = airtime - riseTime;
  const velocity = (2 * apex) / riseTime;
  return {
    velocity,
    gravityUp: velocity / riseTime,
    gravityDown: (2 * apex) / (fallTime * fallTime),
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
   * Gravity for the arc currently in progress, and the scroll speed it was
   * solved for.
   *
   * These get *re-solved* if the world's speed changes mid-air — see
   * `retuneArcForSpeed`. An earlier version froze them at takeoff, reasoning
   * that a committed arc shouldn't be warped underneath the player. That was
   * the wrong invariant and it killed a real run.
   */
  private gravityUp = 0;
  private gravityDown = 0;
  private arcSpeed = 1;

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
    this.arcSpeed = Math.max(1, scrollSpeed);
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
  update(
    dt: number,
    input: Input,
    scrollSpeed: number,
    mods: PlayerMods = NO_MODS,
  ): ShotRequest | null {
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

    // --- Flight --------------------------------------------------------
    // Replaces the whole ground state machine rather than layering on top of
    // it. Hold JUMP to climb, release to sink, clamped to an altitude band —
    // reusing the button the player already associates with "up" instead of
    // inventing a control that only exists for seven seconds.
    if (mods.flying) {
      this.slideTimer = 0;
      this.slideHoldFloor = 0;
      this.grounded = false;
      this.pose = 'fly';
      input.consume('jump');

      this.vy = input.down.jump ? -POWERUP.flightClimbSpeed : POWERUP.flightSinkSpeed;
      this.feetY += this.vy * dt;
      const ceiling = GROUND_Y - POWERUP.flightMaxHeight;
      const floor = GROUND_Y - POWERUP.flightMinHeight;
      if (this.feetY < ceiling) { this.feetY = ceiling; this.vy = 0; }
      if (this.feetY > floor) { this.feetY = floor; this.vy = 0; }

      return this.tryShoot(input, mods.shotCooldownScale, mods.autoFire);
    }

    // Leaving flight mid-air: fall normally from wherever you were.
    if (this.pose === 'fly') this.pose = 'air';

    this.retuneArcForSpeed(scrollSpeed);

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
      const arc = solveJumpArc(scrollSpeed, mods.jumpApexScale, mods.jumpRiseScale);
      this.gravityUp = arc.gravityUp;
      this.gravityDown = arc.gravityDown;
      this.arcSpeed = Math.max(1, scrollSpeed);
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

    const shot = this.tryShoot(input, mods.shotCooldownScale, mods.autoFire);

    this.applyGravity(dt);
    this.integrate(dt);
    this.updatePose();
    return shot;
  }

  /**
   * Fire if the button is down and the cooldown has elapsed.
   * A fresh press fires immediately; holding auto-fires at the cooldown rate.
   */
  private tryShoot(input: Input, cooldownScale = 1, autoFire = false): ShotRequest | null {
    const wantsToShoot = autoFire || input.consume('shoot') || input.down.shoot;
    if (!wantsToShoot || this.shotCooldownTimer > 0) return null;
    this.shotCooldownTimer = PLAYER.shotCooldown * cooldownScale;
    return {
      x: PLAYER_X + PLAYER.muzzleX,
      y:
        this.feetY -
        (this.sliding ? PLAYER.slideHeight : PLAYER.height) +
        (this.sliding ? PLAYER.muzzleYSlide : PLAYER.muzzleYStand),
    };
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

  /**
   * Keep an in-progress jump covering the distance it was launched for, even if
   * the world changes speed underneath it.
   *
   * The jump is defined in world-space — how far and how high (see
   * `jumpDistance`). Freezing gravity at takeoff preserves the *airtime*, which
   * is the wrong quantity: when OVERDRIVE expires mid-air the world slows down,
   * the frozen arc still lands after the same number of seconds, and so it
   * covers far less ground than it was aimed at. That is a real death — you
   * jump a spike at speed, the boost runs out at the apex, and you come down on
   * top of it having done nothing wrong.
   *
   * Scaling velocity by k and gravity by k² (where k is the speed ratio) leaves
   * the apex height untouched and scales the airtime by exactly 1/k — so the
   * ground covered, airtime × speed, is unchanged. The arc you committed to is
   * the arc you get.
   */
  private retuneArcForSpeed(scrollSpeed: number): void {
    if (this.grounded) {
      this.arcSpeed = Math.max(1, scrollSpeed);
      return;
    }
    const speed = Math.max(1, scrollSpeed);
    const k = speed / this.arcSpeed;
    if (Math.abs(k - 1) < 1e-6) return;

    this.vy *= k;
    this.gravityUp *= k * k;
    this.gravityDown *= k * k;
    this.arcSpeed = speed;
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
