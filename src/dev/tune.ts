import { PLAYER, WORLD, DIFFICULTIES, jumpAirtimeAt } from '../game/config';
import { slideDurationAt } from '../game/player';
import { validateDesignContracts } from '../game/state';
import { verify } from './verify';

/**
 * Live tuning from the browser console.
 *
 * Game feel is not something you can reason your way to — you change a number,
 * play for ten seconds, and decide. That loop should take seconds, so this
 * mutates the config in place and the change applies to the very next jump.
 *
 * It also re-runs the design contracts after every change, because the feel
 * knobs and the design constraints are the same numbers: shortening a slide
 * until it feels snappy can quietly shorten it past the point where it clears
 * a beam. You get told immediately instead of discovering it in a run.
 *
 * Dev-only — the whole module is dropped from production builds.
 */

const TUNABLE = [
  'jumpDistance',
  'jumpApex',
  'jumpRiseFraction',
  'jumpCutMultiplier',
  'slideDistance',
  'slideCooldown',
  'coyoteTime',
  'inputBuffer',
  'shotCooldown',
  'invulnDuration',
] as const;

type Tunable = (typeof TUNABLE)[number];

export function tune(changes: Partial<Record<Tunable, number>>): void {
  // PLAYER is `as const` for editing safety in source; at runtime it's a plain
  // object, and this is the one place allowed to write to it.
  const target = PLAYER as unknown as Record<string, number>;

  for (const [key, value] of Object.entries(changes)) {
    if (!(TUNABLE as readonly string[]).includes(key)) {
      console.warn(`[tune] "${key}" isn't tunable. Options: ${TUNABLE.join(', ')}`);
      continue;
    }
    console.log(`[tune] ${key}: ${target[key]} -> ${value}`);
    target[key] = value as number;
  }

  const problems = validateDesignContracts();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[tune] BROKE A DESIGN RULE: ${problem}`);
  }

  const failures = verify().filter((r) => !r.pass);
  if (failures.length > 0) {
    console.error(
      `[tune] ${failures.length} obstacle/verb contracts now fail:`,
      failures.map((f) => `${f.difficulty}/${f.kind}/${f.verb}`).join(', '),
    );
  } else if (problems.length === 0) {
    console.log('[tune] all design contracts still hold');
  }

  showTuning();
}

/** Print the current feel numbers, plus what they work out to at each speed. */
export function showTuning(): void {
  console.log('--- feel ---');
  console.table(
    Object.fromEntries(
      TUNABLE.map((key) => [key, (PLAYER as unknown as Record<string, number>)[key]!]),
    ),
  );

  // The derived values are what you actually experience, so show those too —
  // "jumpDistance 108" means nothing next to "0.72s of airtime".
  console.log('--- what that means in the air ---');
  console.table(
    Object.values(DIFFICULTIES).map((d) => {
      const startSpeed = WORLD.baseScrollSpeed * d.speedScale;
      const topSpeed = WORLD.speedCap * d.speedScale;
      return {
        difficulty: d.label,
        'start speed': Math.round(startSpeed),
        'airtime @start': `${jumpAirtimeAt(startSpeed).toFixed(2)}s`,
        'airtime @top': `${jumpAirtimeAt(topSpeed).toFixed(2)}s`,
        'slide @start': `${slideDurationAt(startSpeed).toFixed(2)}s`,
        'slide @top': `${slideDurationAt(topSpeed).toFixed(2)}s`,
      };
    }),
  );
  console.log(
    'Try: __game.tune({ jumpDistance: 100 })  — lower = snappier jump, higher = floatier',
  );
}
