import { OBSTACLE, PLAYER, jumpAirtimeAt, type Difficulty } from './config';
import { SOLVED_BY, type ObstacleKind } from './obstacles';
import { eligiblePatterns, type Pattern } from './patterns';
import type { Rng } from '../core/rng';

/**
 * Chooses which pattern comes next and when each obstacle in it spawns.
 *
 * Its real job is the guarantee: **no gap it emits is ever too short to survive**.
 * A pattern author writes the rhythm they want; the director is what stops that
 * rhythm from becoming impossible when the game is running at twice the speed
 * it was written at.
 */

/**
 * Baseline time to see a hazard, identify it, and move. Everything else is
 * added on top of this.
 */
const REACTION_SECONDS = 0.26;

/** Rest between patterns at sector 1, and the floor it decays toward. */
const BASE_PATTERN_REST = 1.25;
const MIN_PATTERN_REST = 0.7;
const REST_DECAY_PER_SECTOR = 0.045;

/** Empty track at the start of a run, before the first hazard. */
const OPENING_REST = 1.5;

export interface DirectorContext {
  difficulty: Difficulty;
  sector: number;
  scrollSpeed: number;
  rng: Rng;
}

/**
 * How long the player stays committed after dealing with each hazard type.
 * This is what makes the spacing guarantee real: the next obstacle cannot
 * arrive while the player is still locked into answering the last one.
 */
function recoverySeconds(kind: ObstacleKind, scrollSpeed: number): number {
  switch (kind) {
    case 'spike':
      // You're airborne for the whole jump and can't slide until you land.
      return jumpAirtimeAt(scrollSpeed);
    case 'beam':
      // Slide is hold-to-continue, so the player can release early and act —
      // they're only truly committed for the minimum hold plus the cooldown.
      return PLAYER.slideMinHold + PLAYER.slideCooldown;
    case 'drone':
      // Long enough to land every shot the drone takes to kill.
      return OBSTACLE.drone.hp * PLAYER.shotCooldown;
    case 'skydrone':
      return OBSTACLE.skydrone.hp * PLAYER.shotCooldown;
  }
}

/** The shortest gap that's fair between one hazard and the next. */
export function minimumGapSeconds(previous: ObstacleKind, scrollSpeed: number): number {
  return REACTION_SECONDS + recoverySeconds(previous, scrollSpeed);
}

interface ScheduledBeat {
  kind: ObstacleKind;
  /** Seconds to wait after the previous spawn before this one. */
  delay: number;
}

export class Director {
  private timer = OPENING_REST;
  private pending: ScheduledBeat[] = [];
  private lastPatternId: string | null = null;
  private lastSpawnedKind: ObstacleKind | null = null;

  /** Purely for debugging and the HUD; not used by the simulation. */
  currentPatternId: string | null = null;

  reset(difficulty: Difficulty): void {
    this.timer = OPENING_REST * difficulty.spacingScale;
    this.pending = [];
    this.lastPatternId = null;
    this.lastSpawnedKind = null;
    this.currentPatternId = null;
  }

  /**
   * Advance the schedule, calling `spawn` for each obstacle that's due.
   * Loops rather than spawning at most one per tick, so a very small gap at a
   * very high speed can't silently drift behind.
   */
  update(dt: number, ctx: DirectorContext, spawn: (kind: ObstacleKind) => void): void {
    this.timer -= dt;
    let guard = 0;
    while (this.timer <= 0 && guard++ < 8) {
      if (this.pending.length === 0) this.pending = this.schedule(this.pick(ctx), ctx);

      const beat = this.pending.shift();
      if (!beat) break;
      spawn(beat.kind);
      this.lastSpawnedKind = beat.kind;

      const next = this.pending[0];
      this.timer += next ? next.delay : this.restBetweenPatterns(ctx);
    }
  }

  private pick(ctx: DirectorContext): Pattern {
    const eligible = eligiblePatterns(ctx.difficulty.maxPatternVerbs, ctx.sector);
    // Avoid repeating the pattern we just played, unless it's the only option
    // (easy mode in sector 1 has a small pool).
    const pool =
      eligible.length > 1 ? eligible.filter((p) => p.id !== this.lastPatternId) : eligible;

    const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
    let roll = ctx.rng.next() * totalWeight;
    for (const pattern of pool) {
      roll -= pattern.weight;
      if (roll <= 0) {
        this.lastPatternId = pattern.id;
        this.currentPatternId = pattern.id;
        return pattern;
      }
    }
    const fallback = pool[pool.length - 1]!;
    this.lastPatternId = fallback.id;
    this.currentPatternId = fallback.id;
    return fallback;
  }

  /**
   * Turn a pattern's authored rhythm into concrete delays, widening any gap
   * that's too tight for the verbs on either side of it.
   *
   * This is the whole safety net. Authors write the feel they want and don't
   * have to reason about scroll speed; a gap that reads fine at 150 px/s and
   * becomes unfair at 400 is silently widened rather than shipped broken.
   */
  private schedule(pattern: Pattern, ctx: DirectorContext): ScheduledBeat[] {
    const scheduled: ScheduledBeat[] = [];
    for (let i = 0; i < pattern.beats.length; i++) {
      const beat = pattern.beats[i]!;
      if (i === 0) {
        scheduled.push({ kind: beat.kind, delay: 0 });
        continue;
      }
      const previous = pattern.beats[i - 1]!.kind;
      const authored = beat.gap * ctx.difficulty.spacingScale;
      const floor = minimumGapSeconds(previous, ctx.scrollSpeed);
      scheduled.push({ kind: beat.kind, delay: Math.max(authored, floor) });
    }
    return scheduled;
  }

  /**
   * Gap between patterns, tightening as sectors climb. This is the main lever
   * on difficulty over a run: not faster reactions within a phrase, but less
   * breathing room between them.
   */
  private restBetweenPatterns(ctx: DirectorContext): number {
    const decayed = BASE_PATTERN_REST - REST_DECAY_PER_SECTOR * (ctx.sector - 1);
    const rest = Math.max(MIN_PATTERN_REST, decayed) * ctx.difficulty.spacingScale;
    // Never shorter than what the last hazard demands.
    const lastKind = this.lastSpawnedKind;
    return lastKind ? Math.max(rest, minimumGapSeconds(lastKind, ctx.scrollSpeed)) : rest;
  }
}

/** Re-exported so the verification harness can reason about verbs. */
export { SOLVED_BY };
