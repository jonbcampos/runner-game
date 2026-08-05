import { OBSTACLE, PLAYER, PLAYER_X, jumpAirtimeAt, spawnX, type Difficulty } from './config';
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
  /** Live seconds between shots, so OVERDRIVE's faster gun is accounted for. */
  shotCooldown: number;
  rng: Rng;
}

/**
 * The heaviest armour that can actually be destroyed before contact.
 *
 * Armour and the shot-range cap pull against each other. A drone can only be
 * hit once it's within range, it only stays within range for so long, and
 * shots are paced by a cooldown — so at high scroll speed there is a hard
 * ceiling on how many hits you can land, no matter how well you play.
 *
 * Rather than let the game occasionally spawn something unkillable, the
 * director asks this first and never exceeds the answer. It's the same shape
 * of promise as the spacing floor: the game may be hard, but it is never
 * asking for the impossible.
 *
 * A side effect worth knowing: tough drones are an early- and mid-run feature.
 * Late in a run everything is moving too fast to chew through 5 plates, so
 * difficulty there comes from speed and density instead. HEAVY SHOT doubles
 * this ceiling, which is a large part of why that powerup feels good.
 */
export function maxKillableArmour(
  scrollSpeed: number,
  damagePerShot = 1,
  shotCooldown: number = PLAYER.shotCooldown,
): number {
  // Time from appearing at the right edge to reaching the player's front.
  const approach = (spawnX() - (PLAYER_X + PLAYER.width)) / Math.max(scrollSpeed, 1);
  const usable = approach * OBSTACLE.drone.killSafetyFactor;
  const shots = Math.floor(usable / shotCooldown) + 1;
  return Math.max(OBSTACLE.drone.hp, shots * damagePerShot);
}

/**
 * How long the player stays committed after dealing with each hazard type.
 * This is what makes the spacing guarantee real: the next obstacle cannot
 * arrive while the player is still locked into answering the last one.
 */
function recoverySeconds(
  kind: ObstacleKind,
  scrollSpeed: number,
  armour: number,
  shotCooldown: number,
): number {
  switch (kind) {
    case 'spike':
      // You're airborne for the whole jump and can't slide until you land.
      return jumpAirtimeAt(scrollSpeed);
    case 'beam':
      // Slide is hold-to-continue, so the player can release early and act —
      // they're only truly committed for the minimum hold plus the cooldown.
      return PLAYER.slideMinHold + PLAYER.slideCooldown;
    case 'drone':
    case 'skydrone':
      // Long enough to land every shot this particular drone takes to kill —
      // which is why armour has to be threaded through the spacing maths
      // rather than assumed to be the baseline.
      return armour * shotCooldown;
  }
}

/**
 * The shortest gap that's fair between one hazard and the next.
 * @param armour Hits the previous hazard took to kill, if it was shootable.
 */
export function minimumGapSeconds(
  previous: ObstacleKind,
  scrollSpeed: number,
  armour: number = OBSTACLE.drone.hp,
  shotCooldown: number = PLAYER.shotCooldown,
): number {
  return REACTION_SECONDS + recoverySeconds(previous, scrollSpeed, armour, shotCooldown);
}

/**
 * Choose armour for a drone: unlocked by sector, weighted toward lighter, and
 * hard-capped by what's actually killable at the current speed.
 */
export function pickDroneArmour(
  sector: number,
  scrollSpeed: number,
  rng: Rng,
  shotCooldown: number = PLAYER.shotCooldown,
  difficultyCap = Infinity,
): number {
  // Two separate ceilings, for two separate reasons: what is *possible* at this
  // speed, and what this difficulty should be *asking* of the player.
  const ceiling = Math.min(maxKillableArmour(scrollSpeed, 1, shotCooldown), difficultyCap);
  const eligible = OBSTACLE.drone.tiers.filter(
    (tier) => tier.minSector <= sector && tier.hp <= ceiling,
  );
  if (eligible.length === 0) return OBSTACLE.drone.hp;

  const total = eligible.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = rng.next() * total;
  for (const tier of eligible) {
    roll -= tier.weight;
    if (roll <= 0) return tier.hp;
  }
  return eligible[eligible.length - 1]!.hp;
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
  private lastSpawnedArmour: number = OBSTACLE.drone.hp;

  /** Purely for debugging and the HUD; not used by the simulation. */
  currentPatternId: string | null = null;

  /** Seconds until the next hazard is due. Used to place pickups in the gaps. */
  get secondsUntilNextSpawn(): number {
    return Math.max(0, this.timer);
  }

  /**
   * Seconds since the last hazard went out.
   *
   * Needed alongside the countdown because a pickup has to clear hazards on
   * *both* sides: one that spawned a moment ago is still sitting right next to
   * the spawn point, so checking only the next one leaves the pickup jammed
   * against the previous hazard.
   */
  secondsSinceLastSpawn = Infinity;

  /**
   * Hold off the next hazard for at least `seconds`.
   *
   * Pickups need a gap on both sides, and waiting for one to occur naturally
   * does not work: the rest between patterns shrinks as sectors climb, so late
   * in a run no gap is ever wide enough and pickups stop appearing altogether.
   * Reserving the space instead means the pacing bends slightly around a
   * pickup — roughly once every ten seconds — rather than pickups being
   * silently starved out exactly when the run gets interesting.
   */
  reserveGap(seconds: number): void {
    this.timer = Math.max(this.timer, seconds);
  }

  reset(difficulty: Difficulty): void {
    this.timer = OPENING_REST * difficulty.spacingScale;
    this.pending = [];
    this.lastPatternId = null;
    this.lastSpawnedKind = null;
    this.lastSpawnedArmour = OBSTACLE.drone.hp;
    this.secondsSinceLastSpawn = Infinity;
    this.currentPatternId = null;
  }

  /**
   * Advance the schedule, calling `spawn` for each obstacle that's due.
   * Loops rather than spawning at most one per tick, so a very small gap at a
   * very high speed can't silently drift behind.
   */
  update(
    dt: number,
    ctx: DirectorContext,
    spawn: (kind: ObstacleKind, armour: number) => void,
  ): void {
    this.timer -= dt;
    this.secondsSinceLastSpawn += dt;
    let guard = 0;
    while (this.timer <= 0 && guard++ < 8) {
      if (this.pending.length === 0) this.pending = this.schedule(this.pick(ctx), ctx);

      const beat = this.pending.shift();
      if (!beat) break;

      const armour =
        beat.kind === 'drone'
          ? pickDroneArmour(
              ctx.sector,
              ctx.scrollSpeed,
              ctx.rng,
              ctx.shotCooldown,
              ctx.difficulty.maxDroneArmour,
            )
          : 1;
      spawn(beat.kind, armour);
      this.secondsSinceLastSpawn = 0;
      this.lastSpawnedKind = beat.kind;
      this.lastSpawnedArmour = armour;

      const next = this.pending[0];
      // The gap after a drone depends on how much armour it actually had, so
      // it's resolved here rather than baked into the schedule.
      this.timer += next
        ? Math.max(
            next.delay,
            minimumGapSeconds(beat.kind, ctx.scrollSpeed, armour, ctx.shotCooldown),
          )
        : this.restBetweenPatterns(ctx);
    }
  }

  private pick(ctx: DirectorContext): Pattern {
    const eligible = eligiblePatterns(
      ctx.difficulty.maxPatternVerbs,
      ctx.sector,
      ctx.difficulty.allowedKinds,
    );
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
    return lastKind
      ? Math.max(
          rest,
          minimumGapSeconds(lastKind, ctx.scrollSpeed, this.lastSpawnedArmour, ctx.shotCooldown),
        )
      : rest;
  }
}

/** Re-exported so the verification harness can reason about verbs. */
export { SOLVED_BY };
