/**
 * The colour set the whole game draws with.
 *
 * `PALETTE` is deliberately a *mutable* object rather than a frozen constant:
 * switching theme swaps its contents in place, so every module that already
 * reads `PALETTE.spike` keeps working without knowing themes exist. The
 * alternative — threading a palette argument through every draw call and every
 * UI module — is a lot of plumbing for no benefit, since exactly one palette is
 * ever active at a time.
 */
export interface Palette {
  skyTop: string;
  skyBottom: string;

  farGrid: string;
  midStructure: string;
  nearStructure: string;

  ground: string;
  groundLine: string;

  player: string;
  playerCore: string;
  playerDim: string;

  shot: string;
  shotCore: string;

  spike: string;
  beam: string;
  drone: string;
  droneShield: string;
  /** Armour tier colours, indexed by hit points. See decision 28. */
  droneTier: Record<number, string>;

  hudText: string;
  hudDim: string;
  hudAccent: string;

  buttonIdle: string;
  buttonEdge: string;
  buttonActive: string;

  /**
   * Colour laid over the world behind menus.
   *
   * Its own entry rather than reusing the sky, because the sky is the wrong
   * colour on a light theme: tinting a daylight scene with pale blue washes it
   * out instead of pushing it back, and the menu ends up competing with the
   * background rather than sitting in front of it. A scrim always has to be
   * darker than what it covers.
   */
  scrim: string;
}

export const NEON_PALETTE: Palette = {
  skyTop: '#05060f',
  skyBottom: '#0d1230',

  farGrid: '#141a45',
  midStructure: '#1b2358',
  nearStructure: '#252f78',

  ground: '#0a0d24',
  groundLine: '#3ad9ff',

  player: '#4de2ff',
  playerCore: '#e8fdff',
  playerDim: '#1b6f8c',

  shot: '#ffd166',
  shotCore: '#fff6d8',

  spike: '#ff4d9d',
  beam: '#c86bff',
  drone: '#ff8a4d',
  droneShield: '#ff9d6b',
  droneTier: { 2: '#ff8a4d', 3: '#ff5a2b', 4: '#ff2f1f', 5: '#ffe9e0' },

  hudText: '#dfe8ff',
  hudDim: '#5a6798',
  hudAccent: '#3ad9ff',

  buttonIdle: '#28315e',
  buttonEdge: '#4a5aa8',
  buttonActive: '#4de2ff',
  scrim: '#05060f',
};

/**
 * Bright daylight counterpart. Same structural roles, entirely different mood.
 *
 * The hazard colours still have to be mutually unmistakable — confusing a
 * unicorn for a castle means answering with the wrong verb — so they stay far
 * apart in hue even though the whole set is much softer.
 */
export const UNICORN_PALETTE: Palette = {
  skyTop: '#7fc7ff',
  skyBottom: '#ffd9ee',

  farGrid: '#cfe9ff',
  midStructure: '#a8dcae',
  nearStructure: '#79c78a',

  ground: '#57ad68',
  groundLine: '#fff6d8',

  player: '#ff7eb3',
  playerCore: '#fff3f8',
  playerDim: '#c2648c',

  shot: '#fff06a',
  shotCore: '#ffffff',

  /** The unicorn's mane. Purple is reserved for it — see unicorn.ts. */
  spike: '#8f5cff',
  beam: '#ff4f9c',
  drone: '#8b98b4',
  droneShield: '#c3cfe2',
  droneTier: { 2: '#b3bfd4', 3: '#8b98b4', 4: '#626d88', 5: '#3f475e' },

  hudText: '#43305a',
  hudDim: '#9a86ad',
  hudAccent: '#ff4f9c',

  buttonIdle: '#ffffff',
  buttonEdge: '#ff9ec7',
  buttonActive: '#ff4f9c',
  scrim: '#3a2450',
};

/** The live palette. Mutated in place by the theme switcher. */
export const PALETTE: Palette = {
  ...NEON_PALETTE,
  droneTier: { ...NEON_PALETTE.droneTier },
};

export function applyPalette(next: Palette): void {
  Object.assign(PALETTE, next);
  PALETTE.droneTier = { ...next.droneTier };
}

/** rgba() helper for the glow passes. */
export function alpha(hex: string, a: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${a})`;
}
