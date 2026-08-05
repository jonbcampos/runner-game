import { FIXED_DT, PLAYER_X, type DifficultyId } from '../game/config';
import { ObstacleField, SOLVED_BY, type ObstacleKind } from '../game/obstacles';
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
): boolean {
  const state = new GameState();
  const input = new FakeInput();
  // Empty script: the only hazard is the one placed below.
  state.start(difficulty, 1, []);
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
    if (verb === 'jump') {
      if (timeToImpact < 0.2 && timeToImpact > -0.05 && state.player.grounded) input.press('jump');
      if (timeToImpact < -0.1) input.release('jump');
    } else if (verb === 'slide') {
      if (timeToImpact < 0.2 && timeToImpact > -0.2) input.press('slide');
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
  state.start('hard', 1, []);
  state.obstacles.spawn('spike', ObstacleField.spawnX);

  const maxSteps = Math.ceil(10 / FIXED_DT);
  for (let step = 0; step < maxSteps; step++) {
    state.update(FIXED_DT, input as never);
    if (state.phase === 'gameover') return { reachedGameOver: true, steps: step };
  }
  return { reachedGameOver: false, steps: maxSteps };
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
