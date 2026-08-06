import { WORLD } from '../game/config';
import { PALETTE } from './palette';

/**
 * The time-of-day cycle: the world visibly moves through dawn, day, dusk and
 * night as a run goes on.
 *
 * Why it exists: a run looked the same at three minutes as it did at ten
 * seconds. Escalation was all in the numbers — faster, denser, tougher armour —
 * and none of it in the frame, so a long run felt like a short run repeated.
 * The environment is the part of progression you can see without reading the
 * HUD.
 *
 * **How it stays cheap.** An environment is just the *world* half of the
 * palette — sky, distant layers, ground — and the cycle writes the blended
 * result straight into the live `PALETTE` each frame. Both existing themes draw
 * their backgrounds from exactly those entries, so neither needed changing to
 * become day/night aware, and any future theme gets it by declaring a list.
 *
 * **What it deliberately never touches:** hazard colours, HUD colours, button
 * colours. A cycle that could recolour a hazard could make one unreadable at
 * one time of day and fine at another, which is the worst kind of bug — it
 * only reproduces four minutes into a run. Hazards look the same at midnight
 * as at noon; only the world behind them changes.
 */

/** The world-half of a palette, plus what to hang in the sky above it. */
export interface Environment {
  id: string;
  /** Shown in the sector banner, so the change reads as progress. */
  label: string;

  skyTop: string;
  skyBottom: string;
  farGrid: string;
  midStructure: string;
  nearStructure: string;
  ground: string;
  groundLine: string;

  /**
   * 0 = broad daylight, 1 = fully dark.
   *
   * Themes use this for anything that has to react to the light rather than
   * simply be recoloured: star density, whether an outline should be drawn
   * bright or dark, whether the meadow has butterflies or fireflies.
   */
  darkness: number;

  /** Sun disc height, or null for none. Low at dawn and dusk, high at noon. */
  sunY: number | null;
  /** Moon disc height, or null for none. */
  moonY: number | null;
  /** Fireworks go up here. */
  fireworks?: boolean;
}

/**
 * Fraction of a sector spent crossfading into the next environment.
 *
 * A crossfade rather than a cut because the sky changing is meant to be
 * noticed and not reacted to — a hard swap mid-run reads as a glitch, or worse,
 * as something the player needs to respond to.
 */
const TRANSITION = 0.2;

/** The blended result. One mutable object; nothing allocates per frame. */
const live = {
  darkness: 0,
  sunY: 0,
  sunAlpha: 0,
  moonY: 0,
  moonAlpha: 0,
  fireworks: 0,
  label: '',
};

export type LiveEnvironment = typeof live;

export function environment(): LiveEnvironment {
  return live;
}

/**
 * Advance the cycle and write the world colours into the live palette.
 *
 * Driven by elapsed time rather than by `state.sector` so it keeps moving
 * during a boss fight, when the sector counter is held. One environment per
 * sector-length means the full four-phase cycle takes about eighty seconds.
 */
export function updateEnvironment(list: readonly Environment[], elapsed: number): void {
  if (list.length === 0) return;

  const cycle = elapsed / WORLD.sectorLength;
  const whole = Math.floor(cycle);
  const frac = cycle - whole;
  const current = list[whole % list.length]!;
  const next = list[(whole + 1) % list.length]!;
  const t = frac > 1 - TRANSITION ? (frac - (1 - TRANSITION)) / TRANSITION : 0;

  PALETTE.skyTop = mixHex(current.skyTop, next.skyTop, t);
  PALETTE.skyBottom = mixHex(current.skyBottom, next.skyBottom, t);
  PALETTE.farGrid = mixHex(current.farGrid, next.farGrid, t);
  PALETTE.midStructure = mixHex(current.midStructure, next.midStructure, t);
  PALETTE.nearStructure = mixHex(current.nearStructure, next.nearStructure, t);
  PALETTE.ground = mixHex(current.ground, next.ground, t);
  PALETTE.groundLine = mixHex(current.groundLine, next.groundLine, t);

  live.darkness = lerp(current.darkness, next.darkness, t);
  live.label = t > 0.5 ? next.label : current.label;

  // Discs fade in and out rather than jumping, so the sun setting and the moon
  // rising overlap the way they actually do.
  live.sunAlpha = lerp(current.sunY === null ? 0 : 1, next.sunY === null ? 0 : 1, t);
  live.sunY = lerp(current.sunY ?? next.sunY ?? 0, next.sunY ?? current.sunY ?? 0, t);
  live.moonAlpha = lerp(current.moonY === null ? 0 : 1, next.moonY === null ? 0 : 1, t);
  live.moonY = lerp(current.moonY ?? next.moonY ?? 0, next.moonY ?? current.moonY ?? 0, t);
  live.fireworks = lerp(current.fireworks ? 1 : 0, next.fireworks ? 1 : 0, t);
}

/**
 * Pin the cycle to one environment. Used by the title screen, which should show
 * the theme at its most recognisable rather than at whatever time of day the
 * last run happened to end at.
 */
export function resetEnvironment(list: readonly Environment[]): void {
  updateEnvironment(list, 0);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Blend two #rrggbb colours. Kept here so themes never have to think about it. */
function mixHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const av = parseInt(a.slice(1), 16);
  const bv = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((av >> 16) & 255, (bv >> 16) & 255, t));
  const g = Math.round(lerp((av >> 8) & 255, (bv >> 8) & 255, t));
  const bl = Math.round(lerp(av & 255, bv & 255, t));
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
