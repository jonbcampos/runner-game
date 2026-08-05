import { SOLVED_BY, type ObstacleKind } from './obstacles';

/**
 * The authored pattern library.
 *
 * Obstacles are never spawned individually. They come from short, hand-designed
 * sequences, because randomly placed hazards feel arbitrary — you can tell,
 * playing it, that nobody decided anything. A pattern is a phrase: "jump, then
 * immediately slide", "kill the drone before the spike arrives". Those are the
 * things that make a run feel authored.
 *
 * `gap` is always in SECONDS, never pixels — the invariant unit, so a pattern
 * demands the same reaction time at every scroll speed. The director additionally
 * pads any gap that's too tight for the verbs involved, so no pattern here can
 * be unsurvivable no matter how fast the game gets.
 *
 * This same data is what hand-designed levels would consume later: an endless
 * run is these patterns shuffled, a level is these patterns in a fixed order.
 */

export interface PatternBeat {
  kind: ObstacleKind;
  /** Seconds between the previous beat and this one. Ignored on the first beat. */
  gap: number;
}

export interface Pattern {
  id: string;
  beats: readonly PatternBeat[];
  /** Earliest sector this may appear in, so complexity arrives gradually. */
  minSector: number;
  /** Relative selection weight among eligible patterns. */
  weight: number;
}

/** Shorthand so the library below reads as rhythm rather than as object soup. */
const p = (id: string, minSector: number, weight: number, beats: PatternBeat[]): Pattern => ({
  id,
  minSector,
  weight,
  beats,
});
const spike = (gap = 0): PatternBeat => ({ kind: 'spike', gap });
const beam = (gap = 0): PatternBeat => ({ kind: 'beam', gap });
const drone = (gap = 0): PatternBeat => ({ kind: 'drone', gap });

export const PATTERNS: readonly Pattern[] = [
  // --- Single verb. The vocabulary. Available from the first sector, and the
  // only thing easy mode ever sees. -----------------------------------------
  p('lone-spike', 1, 10, [spike()]),
  p('lone-beam', 1, 10, [beam()]),
  p('lone-drone', 1, 10, [drone()]),
  p('double-spike', 1, 7, [spike(), spike(0.85)]),
  p('double-beam', 1, 5, [beam(), beam(0.9)]),
  p('spike-triplet', 2, 4, [spike(), spike(0.8), spike(0.8)]),
  p('drone-pair', 2, 4, [drone(), drone(1.0)]),

  // --- Two verbs. The first real decisions: the answer changes mid-phrase. --
  p('spike-then-beam', 2, 8, [spike(), beam(1.0)]),
  p('beam-then-spike', 2, 8, [beam(), spike(1.0)]),
  p('spike-then-drone', 2, 8, [spike(), drone(1.0)]),
  p('drone-then-spike', 2, 8, [drone(), spike(1.0)]),
  p('beam-then-drone', 2, 7, [beam(), drone(1.0)]),
  p('drone-then-beam', 2, 7, [drone(), beam(1.0)]),
  // Alternation punishes settling into a rhythm — you have to keep reading.
  p('spike-beam-spike', 3, 5, [spike(), beam(0.95), spike(0.95)]),
  p('beam-spike-beam', 3, 5, [beam(), spike(0.95), beam(0.95)]),
  // Two spikes lulls you into jumping a third time; the third is a beam.
  p('feint-double-spike', 4, 5, [spike(), spike(0.8), beam(0.85)]),

  // --- Three verbs. Every tool in one phrase. Hard mode only. --------------
  p('full-house', 4, 6, [spike(), beam(1.0), drone(1.0)]),
  p('full-house-reversed', 4, 6, [drone(), beam(1.0), spike(1.0)]),
  p('drone-spike-beam', 5, 5, [drone(), spike(0.95), beam(0.95)]),
  p('beam-drone-spike', 5, 5, [beam(), drone(0.95), spike(0.95)]),
  // The closer: shoot under pressure, then two ground reads back to back.
  p('gauntlet', 6, 4, [drone(), spike(0.9), beam(0.85), spike(0.85)]),
];

/** How many distinct verbs a pattern demands. Derived, so it can't drift. */
export function verbCount(pattern: Pattern): number {
  const verbs = new Set(pattern.beats.map((b) => SOLVED_BY[b.kind]));
  return verbs.size;
}

/** Patterns legal for a difficulty's verb ceiling and the current sector. */
export function eligiblePatterns(maxVerbs: number, sector: number): Pattern[] {
  return PATTERNS.filter((pattern) => verbCount(pattern) <= maxVerbs && pattern.minSector <= sector);
}
