/**
 * The neon palette. One place, so the planned 16-bit pixel renderer can be
 * added later as a sibling file without touching anything in src/game/.
 */
export const PALETTE = {
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
  drone: '#ff6b4d',
  droneShield: '#ff9d6b',

  hudText: '#dfe8ff',
  hudDim: '#5a6798',
  hudAccent: '#3ad9ff',

  buttonIdle: '#28315e',
  buttonEdge: '#4a5aa8',
  buttonActive: '#4de2ff',
} as const;

/** rgba() helper for the glow passes. */
export function alpha(hex: string, a: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${a})`;
}
