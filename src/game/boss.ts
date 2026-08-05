import { BOSS, GROUND_Y, SCREEN, type Difficulty } from './config';
import type { Aabb } from './collision';
import { minimumGapSeconds } from './director';
import type { ObstacleKind } from './obstacles';
import type { Rng } from '../core/rng';

/**
 * The boss fight.
 *
 * The design constraint that shaped everything: **the boss must not add a
 * fourth verb.** A boss that needs a new input would make the rest of the game
 * a tutorial for one encounter. So it fights using the vocabulary that already
 * exists — it launches ordinary spikes, beams and drones, and the answers are
 * the answers you already know.
 *
 * What makes it a boss rather than a fast patch of track is the second half of
 * the loop: after an attack run it *closes in* and opens its core. Because
 * shots only reach SHOT.range, that approach is the only moment you can hurt
 * it. So the fight is: survive the barrage, then punish the opening. The shot
 * range cap and this fight justify each other.
 */

export type BossPhase =
  | 'entering'
  | 'attacking'
  | 'closing'
  | 'vulnerable'
  | 'retreating'
  | 'dying'
  | 'done';

/** The rotation of hazards a boss throws. One of each, so every verb is used. */
const ATTACK_CYCLE: readonly ObstacleKind[] = ['spike', 'beam', 'drone'];

export interface BossContext {
  scrollSpeed: number;
  rng: Rng;
}

export class Boss {
  active = false;
  phase: BossPhase = 'done';

  x = 0;
  prevX = 0;
  y = 0;
  prevY = 0;

  hp = 0;
  maxHp = 1;
  hitFlash = 0;

  /** Time left in the current phase. */
  private timer = 0;
  /** Where the current move started, for interpolating the approach. */
  private fromX = 0;
  private toX = 0;
  private fromY = 0;
  private toY = 0;

  private attacksLeft = 0;
  private attackTimer = 0;
  private attackIndex = 0;
  private lastAttackKind: ObstacleKind | null = null;

  get vulnerable(): boolean {
    return this.phase === 'vulnerable';
  }

  /** True while the fight is running and the director should stay quiet. */
  get blocking(): boolean {
    return this.active && this.phase !== 'done';
  }

  private get farX(): number {
    return SCREEN.w - BOSS.farInset;
  }

  /** Altitude while launching hazards: high, and deliberately out of reach. */
  private get farY(): number {
    return GROUND_Y - BOSS.hoverY - BOSS.height / 2;
  }

  /**
   * Altitude while the core is open: low enough that the player's shots — which
   * leave the muzzle around 15px above the ground — actually intersect it.
   */
  private get nearY(): number {
    return GROUND_Y - BOSS.height - BOSS.nearBottomGap;
  }

  spawn(difficulty: Difficulty): void {
    this.active = true;
    this.phase = 'entering';
    this.maxHp = Math.max(3, Math.round(BOSS.hp * BOSS.hpScale[difficulty.id]));
    this.hp = this.maxHp;
    this.y = this.farY;
    this.prevY = this.y;
    this.x = SCREEN.w + BOSS.width;
    this.prevX = this.x;
    this.fromX = this.x;
    this.toX = this.farX;
    this.fromY = this.y;
    this.toY = this.farY;
    this.timer = BOSS.enterDuration;
    this.hitFlash = 0;
    this.attackIndex = 0;
    this.lastAttackKind = null;
  }

  reset(): void {
    this.active = false;
    this.phase = 'done';
    this.hp = 0;
  }

  /**
   * Advance the fight. `launch` is called for each hazard the boss throws;
   * the caller decides where hazards actually go into the world.
   */
  update(dt: number, ctx: BossContext, launch: (kind: ObstacleKind, x: number) => void): void {
    if (!this.active) return;
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    this.timer -= dt;

    switch (this.phase) {
      case 'entering':
        this.glideToward(BOSS.enterDuration);
        if (this.timer <= 0) this.beginAttackRun();
        break;

      case 'attacking':
        this.x = this.farX;
        this.y = this.farY;
        this.attackTimer -= dt;
        if (this.attackTimer <= 0 && this.attacksLeft > 0) {
          const kind = ATTACK_CYCLE[this.attackIndex % ATTACK_CYCLE.length]!;
          this.attackIndex++;
          this.attacksLeft--;
          launch(kind, this.x);

          // Even a boss can't break the spacing guarantee: the gap to the next
          // hazard is never shorter than the verbs involved actually allow.
          const floor = this.lastAttackKind
            ? minimumGapSeconds(this.lastAttackKind, ctx.scrollSpeed)
            : 0;
          this.attackTimer = Math.max(BOSS.attackGap, floor);
          this.lastAttackKind = kind;
        }
        // Only close in once the last hazard has had time to arrive, so the
        // player isn't asked to dodge and punish at the same moment.
        if (this.attacksLeft <= 0 && this.attackTimer <= 0) {
          this.startMove('closing', this.farX, BOSS.nearX, this.farY, this.nearY, BOSS.closeDuration);
        }
        break;

      case 'closing':
        this.glideToward(BOSS.closeDuration);
        if (this.timer <= 0) {
          this.phase = 'vulnerable';
          this.timer = BOSS.vulnerableDuration;
          this.x = BOSS.nearX;
          this.y = this.nearY;
        }
        break;

      case 'vulnerable':
        this.x = BOSS.nearX;
        this.y = this.nearY;
        if (this.timer <= 0) {
          this.startMove('retreating', BOSS.nearX, this.farX, this.nearY, this.farY, BOSS.retreatDuration);
        }
        break;

      case 'retreating':
        this.glideToward(BOSS.retreatDuration);
        if (this.timer <= 0) this.beginAttackRun();
        break;

      case 'dying':
        // Drifts back and up as it comes apart.
        this.x += 40 * dt;
        this.y -= 18 * dt;
        if (this.timer <= 0) {
          this.phase = 'done';
          this.active = false;
        }
        break;

      case 'done':
        break;
    }
  }

  private beginAttackRun(): void {
    this.phase = 'attacking';
    this.x = this.farX;
    this.attacksLeft = BOSS.attacksPerRun;
    // A moment of warning before the first hazard of a run.
    this.attackTimer = 0.5;
  }

  private startMove(
    phase: BossPhase,
    fromX: number,
    toX: number,
    fromY: number,
    toY: number,
    duration: number,
  ): void {
    this.phase = phase;
    this.fromX = fromX;
    this.toX = toX;
    this.fromY = fromY;
    this.toY = toY;
    this.timer = duration;
  }

  /** Ease along both axes over the phase, using the remaining timer. */
  private glideToward(duration: number): void {
    const progress = 1 - Math.max(0, this.timer) / duration;
    // Smoothstep, so approaches decelerate instead of stopping dead.
    const eased = progress * progress * (3 - 2 * progress);
    this.x = this.fromX + (this.toX - this.fromX) * eased;
    this.y = this.fromY + (this.toY - this.fromY) * eased;
  }

  /** @returns true if the hit landed. Only the open core can be damaged. */
  takeHit(damage: number): boolean {
    if (!this.vulnerable) return false;
    this.hp -= damage;
    this.hitFlash = 0.1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.phase = 'dying';
      this.timer = BOSS.deathDuration;
      return true;
    }
    return true;
  }

  get defeated(): boolean {
    return this.phase === 'dying' || this.phase === 'done';
  }

  bounds(out: Aabb, alpha = 1): Aabb {
    out.x = this.prevX + (this.x - this.prevX) * alpha;
    out.y = this.prevY + (this.y - this.prevY) * alpha;
    out.w = BOSS.width;
    out.h = BOSS.height;
    return out;
  }
}
