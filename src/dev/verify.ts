import {
  DIFFICULTIES,
  FIXED_DT,
  OBSTACLE,
  PLAYER,
  POWERUP,
  PLAYER_X,
  SHOT,
  WORLD,
  type DifficultyId,
} from '../game/config';
import { Director, maxKillableArmour, minimumGapSeconds } from '../game/director';
import { ObstacleField, SOLVED_BY, type ObstacleKind } from '../game/obstacles';
import { Rng } from '../core/rng';
import { slideDurationAt } from '../game/player';
import { POWERUP_DEFS, type PowerupKind } from '../game/powerups';
import { GameState } from '../game/state';
import type { Action } from '../core/input';

/**
 * Headless verification of the core design contract:
 * every obstacle family must be survivable with exactly one verb, and lethal
 * with the other two (and with doing nothing).
 *
 * This runs the real GameState against a fake input rather than checking the
 * arithmetic in config.ts, so it catches breakage anywhere in the chain —
 * physics, hitbox sizing, state machine, collision. It's the M1 exit criteria
 * expressed as something a machine can re-check in a second, which matters
 * because every future tuning change can silently invalidate one of these.
 *
 * Run it from the browser console: `__game.verify()`.
 */

/** Minimal stand-in for Input: only the surface the simulation actually reads. */
class FakeInput {
  down: Record<Action, boolean> = { jump: false, shoot: false, slide: false };
  private buffer: Record<Action, number> = { jump: 0, shoot: 0, slide: 0 };

  press(action: Action): void {
    this.buffer[action] = 0.13;
    this.down[action] = true;
  }

  release(action: Action): void {
    this.down[action] = false;
  }

  tick(dt: number): void {
    for (const key of ['jump', 'shoot', 'slide'] as Action[]) {
      if (this.buffer[key] > 0) this.buffer[key] = Math.max(0, this.buffer[key] - dt);
    }
  }

  consume(action: Action): boolean {
    if (this.buffer[action] <= 0) return false;
    this.buffer[action] = 0;
    return true;
  }

  hasBuffered(action: Action): boolean {
    return this.buffer[action] > 0;
  }

  clearBuffers(): void {
    this.buffer = { jump: 0, shoot: 0, slide: 0 };
  }
}

export interface TrialResult {
  difficulty: DifficultyId;
  kind: ObstacleKind;
  verb: Action | 'nothing';
  survived: boolean;
  expected: boolean;
  pass: boolean;
}

/**
 * Run one obstacle at the player while performing one verb (or nothing).
 * @returns whether the player got through untouched.
 */
function trial(
  kind: ObstacleKind,
  verb: Action | 'nothing',
  difficulty: DifficultyId = 'normal',
  powerup: PowerupKind | null = null,
): boolean {
  const state = new GameState();
  const input = new FakeInput();
  // Director off: the only hazard is the one placed below.
  state.start(difficulty, 1, false);
  if (powerup) {
    state.activePowerup = powerup;
    state.powerupRemaining = 999;
  }
  const startingHp = state.player.hp;

  const obstacle = state.obstacles.spawn(kind, ObstacleField.spawnX);
  if (!obstacle) throw new Error('failed to spawn test obstacle');

  // Simulate up to 8 seconds — far longer than it takes the hazard to cross.
  const maxSteps = Math.ceil(8 / FIXED_DT);
  for (let step = 0; step < maxSteps; step++) {
    // Time until the hazard reaches the player — not distance. A human reacts
    // on a clock, so a fixed pixel trigger would fire absurdly early at slow
    // speeds and absurdly late at fast ones, testing something nobody does.
    const lead = obstacle.x - PLAYER_X;
    const timeToImpact = lead / state.scrollSpeed;

    // Deliberately imprecise: commit ~0.2s out rather than frame-perfectly, so
    // a mechanic that only works on a pixel-tight window still reads as broken.
    // Tall obstacles get an earlier commit, because that's what a person does —
    // you start a big jump sooner than a hop.
    const commitAt = obstacle.h > 30 ? 0.34 : 0.2;
    if (verb === 'jump') {
      if (timeToImpact < commitAt && timeToImpact > -0.05 && state.player.grounded) {
        input.press('jump');
      }
      if (timeToImpact < -0.1) input.release('jump');
    } else if (verb === 'slide') {
      // Slide is hold-to-continue, so this holds from ~0.2s out until the
      // hazard's trailing edge is behind the player — which is what a person
      // does. A tap deliberately isn't enough any more, and shouldn't be.
      const trailingEdgeCleared = lead + obstacle.w + 8 < 0;
      if (timeToImpact < 0.2 && !trailingEdgeCleared) input.press('slide');
      else input.release('slide');
    } else if (verb === 'shoot') {
      // Fire from the moment it's on screen; the cooldown paces it.
      input.press('shoot');
    }

    state.update(FIXED_DT, input as never);

    if (state.player.hp < startingHp) return false;
    // Hazard is fully behind the player and never touched them.
    if (obstacle.x + obstacle.w < PLAYER_X - 8 || !obstacle.active) return true;
  }
  // Ran out of time without a resolution — treat as a failure to survive so it
  // surfaces rather than silently passing.
  return false;
}

/**
 * Losing your last HP must actually end the run.
 *
 * Separate from the obstacle contracts because those only assert "did the
 * player get hit" — they'd happily pass while the game sat forever in a dead
 * run that never reaches the game-over screen. Which is exactly what happened:
 * the corpse was being clamped to the ground by the normal landing code, so it
 * never fell off-screen and `endRun()` never fired.
 */
function trialGameOver(): { reachedGameOver: boolean; steps: number } {
  const state = new GameState();
  const input = new FakeInput();
  // 'hard' is 1 HP, so a single hit is fatal.
  state.start('hard', 1, false);
  state.obstacles.spawn('spike', ObstacleField.spawnX);

  const maxSteps = Math.ceil(10 / FIXED_DT);
  for (let step = 0; step < maxSteps; step++) {
    state.update(FIXED_DT, input as never);
    if (state.phase === 'gameover') return { reachedGameOver: true, steps: step };
  }
  return { reachedGameOver: false, steps: maxSteps };
}

/**
 * Slide must respond to how long the button is held, the way the jump does.
 *
 * Three things have to hold at once, and they pull against each other: a tap
 * has to end early (or it isn't hold-to-slide), a tap still has to last the
 * minimum (or it looks like a dropped input), and a full hold has to reach the
 * distance-derived cap (or it stops clearing beams).
 */
function trialSlideHold(): { tapEndsEarly: boolean; tapRespectsFloor: boolean; holdReachesMax: boolean } {
  const measure = (holdSeconds: number): number => {
    const state = new GameState();
    const input = new FakeInput();
    state.start('normal', 1, false);
    input.press('slide');

    let elapsed = 0;
    let slidingFor = 0;
    for (let step = 0; step < Math.ceil(4 / FIXED_DT); step++) {
      if (elapsed >= holdSeconds) input.release('slide');
      state.update(FIXED_DT, input as never);
      elapsed += FIXED_DT;
      if (state.player.sliding) slidingFor += FIXED_DT;
      else if (slidingFor > 0) break;
    }
    return slidingFor;
  };

  const maxSlide = slideDurationAt(WORLD.baseScrollSpeed * DIFFICULTIES.normal.speedScale);
  const tap = measure(0.01);
  const held = measure(10);

  return {
    tapEndsEarly: tap < maxSlide * 0.6,
    // Within a step of the floor; the loop can't land exactly on it.
    tapRespectsFloor: tap >= PLAYER.slideMinHold - FIXED_DT * 2,
    holdReachesMax: held >= maxSlide - FIXED_DT * 2,
  };
}

/**
 * The director must never emit a gap too short for the verbs on either side.
 *
 * This drives the real director rather than inspecting the pattern table,
 * because the table is only half the story — patterns are authored at a
 * comfortable rhythm and the director is what widens them as the game speeds
 * up. Checked at the speed cap, which is the worst case: the fastest the world
 * ever moves, so the least real time any authored gap is worth.
 */
function trialDirectorSpacing(): { difficulty: DifficultyId; violations: number; spawns: number }[] {
  const out: { difficulty: DifficultyId; violations: number; spawns: number }[] = [];

  for (const difficultyId of ['kid', 'normal', 'hard'] as DifficultyId[]) {
    const difficulty = DIFFICULTIES[difficultyId];
    const director = new Director();
    director.reset(difficulty);
    const rng = new Rng(7);
    // Pin to the top speed this difficulty ever reaches.
    const scrollSpeed = WORLD.speedCap * difficulty.speedScale;

    let elapsed = 0;
    let lastSpawnAt = -Infinity;
    let lastKind: ObstacleKind | null = null;
    let violations = 0;
    let spawns = 0;

    // Deep into a run, so late-sector patterns and the tightened rest are covered.
    for (let step = 0; step < Math.ceil(300 / FIXED_DT); step++) {
      const sector = Math.floor(elapsed / WORLD.sectorLength) + 1;
      director.update(FIXED_DT, { difficulty, sector, scrollSpeed, rng }, (kind) => {
        if (lastKind) {
          const gap = elapsed - lastSpawnAt;
          // One step of tolerance: spawns land on tick boundaries.
          if (gap < minimumGapSeconds(lastKind, scrollSpeed) - FIXED_DT * 2) violations++;
        }
        lastSpawnAt = elapsed;
        lastKind = kind;
        spawns++;
      });
      elapsed += FIXED_DT;
    }
    out.push({ difficulty: difficultyId, violations, spawns });
  }
  return out;
}

/**
 * A boss fight must be winnable by shooting during its openings.
 *
 * Worth a dedicated test because the failure mode is silent and total: the boss
 * originally hovered ~96px up while the player's gun fires from ~15px, so every
 * shot sailed underneath and the fight was unwinnable. Nothing errored, nothing
 * looked wrong, the health bar just never moved. This holds the boss forever
 * within reach of the muzzle.
 */
function trialBossFight(difficultyId: DifficultyId): { killed: boolean; seconds: number } {
  const state = new GameState();
  const input = new FakeInput();
  state.start(difficultyId, 3);
  state.boss.spawn(DIFFICULTIES[difficultyId]);

  // Hold fire the entire time. A competent player shoots at every opening, so
  // if constant fire can't win, no input pattern can.
  input.press('shoot');

  let elapsed = 0;
  for (let step = 0; step < Math.ceil(90 / FIXED_DT); step++) {
    // Immortal player: this tests the boss, not the player's dodging.
    state.player.hp = 99;
    state.player.maxHp = 99;
    state.update(FIXED_DT, input as never);
    elapsed += FIXED_DT;
    if (state.boss.phase === 'dying' || !state.boss.active) {
      return { killed: true, seconds: elapsed };
    }
  }
  return { killed: false, seconds: elapsed };
}

/**
 * A shuttered boss must be immune.
 *
 * Asserted directly against `takeHit` rather than inferred from a running
 * fight: the boss can open and take a legal hit within a single tick, so
 * sampling phase around `update` races and reports false violations. Testing
 * the guard itself is both simpler and actually correct.
 */
function trialBossInvulnerability(): boolean {
  const state = new GameState();
  state.start('normal', 3, false);
  const boss = state.boss;
  boss.spawn(DIFFICULTIES.normal);

  const startingHp = boss.hp;
  // Every phase that is not 'vulnerable' must reject damage.
  for (const phase of ['entering', 'attacking', 'closing', 'retreating'] as const) {
    boss.phase = phase;
    boss.takeHit(99);
    if (boss.hp !== startingHp) return false;
  }
  boss.phase = 'vulnerable';
  boss.takeHit(1);
  return boss.hp === startingHp - 1;
}

/** Shots must actually expire at their range limit. */
function trialShotRange(): { maxTravel: number; range: number; ok: boolean } {
  const state = new GameState();
  const input = new FakeInput();
  state.start('normal', 1, false);
  input.press('shoot');

  let maxTravel = 0;
  for (let step = 0; step < Math.ceil(4 / FIXED_DT); step++) {
    state.update(FIXED_DT, input as never);
    for (const shot of state.shots.shots) {
      if (shot.active) maxTravel = Math.max(maxTravel, shot.travelled);
    }
  }
  // Within one step of the limit, and definitely not past it.
  const step = SHOT.speed * FIXED_DT;
  return { maxTravel, range: state.shotRange, ok: maxTravel <= state.shotRange && maxTravel > state.shotRange - step * 2 };
}

/**
 * Every powerup must measurably do the thing it claims.
 *
 * The failure mode here is silence: a powerup that's wired up but has no effect
 * looks completely normal — you collect it, the HUD shows a timer, and nothing
 * happens. So each one is asserted against an observable quantity rather than
 * against "did the state field get set".
 */
function trialPowerups(): { kind: PowerupKind; effect: string; ok: boolean }[] {
  const out: { kind: PowerupKind; effect: string; ok: boolean }[] = [];

  const withPowerup = (kind: PowerupKind | null): GameState => {
    const state = new GameState();
    state.start('normal', 1, false);
    if (kind) {
      state.activePowerup = kind;
      state.powerupRemaining = POWERUP_DEFS[kind].duration;
    }
    return state;
  };

  const base = withPowerup(null);

  const longShot = withPowerup('longShot');
  out.push({ kind: 'longShot', effect: `range ${base.shotRange} -> ${longShot.shotRange}`,
    ok: longShot.shotRange > base.shotRange });

  const power = withPowerup('power');
  out.push({ kind: 'power', effect: `damage ${base.shotDamage} -> ${power.shotDamage}`,
    ok: power.shotDamage > base.shotDamage });

  // Speed has to move BOTH the world and the score, or it isn't a gamble.
  const speed = withPowerup('speed');
  const input = new FakeInput();
  for (let i = 0; i < 120; i++) speed.update(FIXED_DT, input as never);
  const plain = withPowerup(null);
  for (let i = 0; i < 120; i++) plain.update(FIXED_DT, input as never);
  const fasterWorld = speed.scrollSpeed > plain.scrollSpeed;
  const betterScore = speed.metres > plain.metres;
  out.push({ kind: 'speed',
    effect: `speed ${Math.round(plain.scrollSpeed)}->${Math.round(speed.scrollSpeed)}, score ${plain.metres}->${speed.metres}`,
    ok: fasterWorld && betterScore });

  // High jump must clear a beam — the thing no ordinary jump can do.
  const highJumpClears = trial('beam', 'jump', 'normal', 'highJump');
  const normalJumpFails = !trial('beam', 'jump', 'normal', null);
  out.push({ kind: 'highJump', effect: 'clears a beam that a normal jump cannot',
    ok: highJumpClears && normalJumpFails });

  // Invincibility must survive the one thing nothing else survives: standing
  // still in front of a spike.
  const invincibleSurvives = trial('spike', 'nothing', 'normal', 'invincible');
  out.push({ kind: 'invincible', effect: 'survives an unavoided spike', ok: invincibleSurvives });

  // Flight: climbs while JUMP is held, and sky drones appear to meet you.
  const fly = withPowerup('flight');
  fly.start('normal', 1, true);
  fly.activePowerup = 'flight';
  fly.powerupRemaining = 99;
  const flyInput = new FakeInput();
  flyInput.press('jump');
  const startY = fly.player.feetY;
  let sawSkyDrone = false;
  for (let i = 0; i < 120 * 4; i++) {
    fly.player.hp = 99;
    fly.update(FIXED_DT, flyInput as never);
    if (fly.obstacles.items.some((o) => o.active && o.kind === 'skydrone')) sawSkyDrone = true;
  }
  const climbed = fly.player.feetY < startY - 20;
  out.push({ kind: 'flight', effect: `climbed ${Math.round(startY - fly.player.feetY)}px, sky drones: ${sawSkyDrone}`,
    ok: climbed && sawSkyDrone });

  // REPAIR is instant, so it's checked by its three distinct behaviours rather
  // than through the timed-effect harness above.
  const repair = trialRepair();
  out.push({ kind: 'repair', effect: repair.detail, ok: repair.ok });

  return out;
}

/**
 * REPAIR must heal when hurt, extend the maximum when full, and stop at the cap.
 *
 * The middle case is the one that matters: without it the pickup is dead weight
 * whenever you're healthy, and on HARD — which starts at one hit point and so
 * can never be "hurt but alive" — it would do nothing at all.
 */
function trialRepair(): { ok: boolean; detail: string } {
  const heal = new GameState();
  heal.start('normal', 1, false);
  heal.player.hp = 1;
  collectRepair(heal);
  const healed = heal.player.hp === 2 && heal.player.maxHp === 2;

  const extend = new GameState();
  extend.start('hard', 1, false);
  const startMax = extend.player.maxHp;
  collectRepair(extend);
  const extended = extend.player.maxHp === startMax + 1 && extend.player.hp === startMax + 1;

  const capped = new GameState();
  capped.start('hard', 1, false);
  for (let i = 0; i < 6; i++) collectRepair(capped);
  const ceiling = DIFFICULTIES.hard.hp + POWERUP.repairMaxBonus;
  const respectsCap = capped.player.maxHp === ceiling;

  return {
    ok: healed && extended && respectsCap,
    detail: `heal=${healed} extendWhenFull=${extended} cap=${capped.player.maxHp}/${ceiling}`,
  };
}

/** Drop a repair pickup onto the player and tick once so it's collected. */
function collectRepair(state: GameState): void {
  const box = { x: 0, y: 0, w: 0, h: 0 };
  state.player.bounds(box);
  state.pickups.spawn('repair', box.x, box.y);
  state.update(FIXED_DT, new FakeInput() as never);
}

/**
 * Every drone the director can emit must be killable before it reaches you.
 *
 * Armour and the shot-range cap pull in opposite directions: heavier armour
 * needs more time, and a faster world gives less of it. Above some speed a
 * 5-plate drone cannot be destroyed by any input at all — and the failure looks
 * exactly like the player being bad, which is the worst kind of unfairness
 * because it's invisible.
 *
 * So this walks the whole speed range each difficulty actually reaches, asks
 * the director what it would spawn, and verifies that a player holding fire
 * from the moment it appears actually destroys it.
 */
function trialDroneArmour(difficultyId: DifficultyId): {
  checked: number;
  worstArmour: number;
  failures: string[];
} {
  const difficulty = DIFFICULTIES[difficultyId];
  const failures: string[] = [];
  let checked = 0;
  let worstArmour = 0;

  const baseSpeed = WORLD.baseScrollSpeed * difficulty.speedScale;
  const topSpeed = WORLD.speedCap * difficulty.speedScale;

  for (let step = 0; step <= 6; step++) {
    const scrollSpeed = baseSpeed + ((topSpeed - baseSpeed) * step) / 6;
    const ceiling = maxKillableArmour(scrollSpeed);

    for (const tier of OBSTACLE.drone.tiers) {
      if (tier.hp > ceiling) continue; // The director would never emit this.
      checked++;
      worstArmour = Math.max(worstArmour, tier.hp);

      const state = new GameState();
      const input = new FakeInput();
      state.start(difficultyId, 1, false);
      // Pin the speed: this is about the interaction, not about escalation.
      state.scrollSpeed = scrollSpeed;
      const drone = state.obstacles.spawn('drone', ObstacleField.spawnX, undefined, tier.hp);
      if (!drone) continue;

      input.press('shoot');
      let killed = false;
      for (let i = 0; i < Math.ceil(8 / FIXED_DT); i++) {
        state.scrollSpeed = scrollSpeed;
        state.player.hp = 99;
        state.update(FIXED_DT, input as never);
        if (!drone.active || drone.hp <= 0) { killed = true; break; }
        if (drone.x + drone.w < PLAYER_X) break; // Reached us still alive.
      }
      if (!killed) {
        failures.push(`${tier.hp}-plate at ${Math.round(scrollSpeed)}px/s`);
      }
    }
  }
  return { checked, worstArmour, failures };
}

export function verify(): TrialResult[] {
  const kinds: ObstacleKind[] = ['spike', 'beam', 'drone'];
  const verbs: (Action | 'nothing')[] = ['jump', 'slide', 'shoot', 'nothing'];
  // Every difficulty, because they change scroll speed, and scroll speed is
  // what decides how much ground a jump or slide actually covers. Easy mode is
  // the slowest and therefore the tightest — testing only 'normal' hides that.
  const difficulties: DifficultyId[] = ['kid', 'normal', 'hard'];
  const results: TrialResult[] = [];

  for (const difficulty of difficulties) {
    for (const kind of kinds) {
      for (const verb of verbs) {
        const expected = verb === SOLVED_BY[kind];
        const survived = trial(kind, verb, difficulty);
        results.push({ difficulty, kind, verb, survived, expected, pass: survived === expected });
      }
    }
  }

  const gameOver = trialGameOver();
  results.push({
    difficulty: 'hard',
    kind: 'spike',
    verb: 'nothing',
    survived: !gameOver.reachedGameOver,
    expected: false,
    pass: gameOver.reachedGameOver,
  });
  console.log(
    gameOver.reachedGameOver
      ? `[verify] fatal hit reaches game over in ${(gameOver.steps * FIXED_DT).toFixed(2)}s`
      : '[verify] BROKEN: a fatal hit never reaches the game-over screen',
  );

  for (const row of trialDirectorSpacing()) {
    const ok = row.violations === 0;
    results.push({
      difficulty: row.difficulty,
      kind: 'spike',
      verb: 'nothing',
      survived: ok,
      expected: true,
      pass: ok,
    });
    console.log(
      ok
        ? `[verify] director spacing ok on ${row.difficulty} (${row.spawns} spawns at top speed)`
        : `[verify] director emitted ${row.violations} unsurvivable gaps on ${row.difficulty}`,
    );
  }

  const range = trialShotRange();
  results.push({ difficulty: 'normal', kind: 'drone', verb: 'shoot',
    survived: range.ok, expected: true, pass: range.ok });
  console.log(
    range.ok
      ? `[verify] shot range enforced (max travel ${Math.round(range.maxTravel)} of ${range.range})`
      : `[verify] shot range BROKEN: travelled ${Math.round(range.maxTravel)}, limit ${range.range}`,
  );

  for (const difficultyId of ['kid', 'normal', 'hard'] as DifficultyId[]) {
    const fight = trialBossFight(difficultyId);
    results.push({ difficulty: difficultyId, kind: 'drone', verb: 'shoot',
      survived: fight.killed, expected: true, pass: fight.killed });
    console.log(
      fight.killed
        ? `[verify] boss on ${difficultyId} beaten in ${fight.seconds.toFixed(1)}s`
        : `[verify] boss on ${difficultyId} UNWINNABLE — survived ${fight.seconds.toFixed(0)}s of constant fire`,
    );
  }

  const shuttered = trialBossInvulnerability();
  results.push({ difficulty: 'normal', kind: 'drone', verb: 'shoot',
    survived: shuttered, expected: true, pass: shuttered });
  if (!shuttered) console.error('[verify] boss takes damage while shuttered');

  for (const row of trialPowerups()) {
    results.push({ difficulty: 'normal', kind: 'drone', verb: 'shoot',
      survived: row.ok, expected: true, pass: row.ok });
    console.log(
      row.ok
        ? `[verify] powerup ${row.kind}: ${row.effect}`
        : `[verify] powerup ${row.kind} HAS NO EFFECT — ${row.effect}`,
    );
  }

  for (const difficultyId of ['kid', 'normal', 'hard'] as DifficultyId[]) {
    const armour = trialDroneArmour(difficultyId);
    const ok = armour.failures.length === 0;
    results.push({ difficulty: difficultyId, kind: 'drone', verb: 'shoot',
      survived: ok, expected: true, pass: ok });
    console.log(
      ok
        ? `[verify] drone armour ok on ${difficultyId} (${armour.checked} tier/speed combos, up to ${armour.worstArmour} plates)`
        : `[verify] UNKILLABLE drones on ${difficultyId}: ${armour.failures.join(', ')}`,
    );
  }

  const slide = trialSlideHold();
  for (const [name, ok] of Object.entries(slide)) {
    results.push({
      difficulty: 'normal',
      kind: 'beam',
      verb: 'slide',
      survived: ok,
      expected: true,
      pass: ok,
    });
    if (!ok) console.error(`[verify] hold-to-slide BROKEN: ${name}`);
  }

  const failures = results.filter((r) => !r.pass);
  console.table(
    results.map((r) => ({
      difficulty: r.difficulty,
      obstacle: r.kind,
      verb: r.verb,
      survived: r.survived,
      shouldSurvive: r.expected,
      result: r.pass ? 'PASS' : 'FAIL',
    })),
  );
  console.log(
    failures.length === 0
      ? `[verify] all ${results.length} obstacle/verb contracts hold`
      : `[verify] ${failures.length} of ${results.length} contracts BROKEN`,
  );
  return results;
}
