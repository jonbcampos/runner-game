import type { GameState } from '../game/state';
import type { Environment } from './environment';
import { applyPalette, type Palette } from './palette';

/**
 * A theme is a complete visual skin: a palette plus how to draw every entity.
 *
 * The split between theme and simulation is the one from decision 6, now
 * actually cashed in. `src/game/` has never imported from `src/render/`, so a
 * theme can reinterpret every hazard — a spike becomes a bramble, a beam
 * becomes a rainbow to duck under — while the hitboxes, the spacing guarantees
 * and all 66 checks stay exactly as they were. A theme changes what the game
 * *looks* like and nothing about what it *is*.
 *
 * Every method takes the same three arguments so themes stay interchangeable,
 * and each owns its whole layer rather than filling in slots on a shared
 * drawing routine — otherwise every new theme would be constrained by whatever
 * the first one happened to need.
 */
export interface Theme {
  id: string;
  /** Shown on the title-screen picker. */
  label: string;
  palette: Palette;

  /**
   * The time-of-day cycle this theme runs through, one per sector, looping.
   *
   * A list rather than a single background because a run that looks identical
   * at ten seconds and at three minutes feels like a short run repeated — see
   * decision 40. The cycle only ever rewrites the world half of the palette, so
   * a theme gets day/night by declaring these and changing nothing else.
   */
  environments: readonly Environment[];

  background(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void;
  boss(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void;
  obstacles(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void;
  pickups(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void;
  shots(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void;
  player(ctx: CanvasRenderingContext2D, state: GameState, alpha: number): void;
}

const THEME_KEY = 'ellies-rainbow-run.theme';

const registry: Theme[] = [];
let active: Theme | null = null;

export function registerTheme(theme: Theme): void {
  if (!registry.some((t) => t.id === theme.id)) registry.push(theme);
}

export function themes(): readonly Theme[] {
  return registry;
}

export function activeTheme(): Theme {
  if (!active) throw new Error('no theme registered');
  return active;
}

export function setTheme(id: string): void {
  const theme = registry.find((t) => t.id === id) ?? registry[0];
  if (!theme) return;
  active = theme;
  applyPalette(theme.palette);
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    // Private-mode storage failures shouldn't stop the game rendering.
  }
}

/** Restore the last chosen theme, falling back to the first registered one. */
export function initTheme(defaultId: string): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    saved = null;
  }
  setTheme(saved ?? defaultId);
}

/** Cycle to the next theme. The title-screen button does this. */
export function nextTheme(): Theme {
  const index = registry.findIndex((t) => t.id === active?.id);
  const next = registry[(index + 1) % registry.length]!;
  setTheme(next.id);
  return next;
}
