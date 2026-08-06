import { GROUND_Y, VIRTUAL_H, SCREEN } from '../game/config';
import { environment } from './environment';
import { drawFireworks } from './fireworks';
import { PALETTE, alpha } from './palette';

/**
 * Scrolling background layers.
 *
 * Parallax is the cheapest possible way to communicate speed. The layers move
 * at fractions of the scroll speed, so when the game accelerates between
 * sectors the player *feels* it in the whole frame rather than only in how fast
 * the hazards arrive.
 *
 * Everything is drawn procedurally from the scroll distance — there's no state
 * to update and nothing to allocate per frame.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  distance: number,
  elapsed: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCREEN.w, VIRTUAL_H);

  drawStars(ctx, distance * 0.05);
  drawFireworks(ctx, elapsed, environment().fireworks);
  drawSkyline(ctx, distance * 0.18, 0.55, PALETTE.farGrid, 34, 78);
  drawSkyline(ctx, distance * 0.38, 0.75, PALETTE.midStructure, 52, 58);
  drawGroundGrid(ctx, distance);
}

function drawStars(ctx: CanvasRenderingContext2D, offset: number): void {
  ctx.fillStyle = alpha(PALETTE.hudText, 0.35);
  // Deterministic pseudo-star field: cheap hash of the index, no allocation.
  for (let i = 0; i < 40; i++) {
    const seed = i * 2654435761;
    const baseX = (seed >>> 8) % (SCREEN.w * 2);
    const y = ((seed >>> 3) % 120) + 8;
    const x = wrap(baseX - offset, SCREEN.w * 2);
    if (x > SCREEN.w) continue;
    ctx.fillRect(Math.floor(x), y, 1, 1);
  }
}

function drawSkyline(
  ctx: CanvasRenderingContext2D,
  offset: number,
  heightScale: number,
  color: string,
  spacing: number,
  maxHeight: number,
): void {
  ctx.fillStyle = color;
  const period = spacing * 2;
  const span = SCREEN.w + period * 2;
  const start = Math.floor(offset / period) * period;

  for (let i = 0; i * spacing < span; i++) {
    const worldX = start + i * spacing;
    const x = worldX - offset;
    if (x > SCREEN.w || x < -period) continue;

    const seed = Math.abs(Math.floor(worldX / spacing)) * 2246822519;
    const h = (((seed >>> 5) % maxHeight) + 18) * heightScale;
    const w = ((seed >>> 11) % 22) + 14;
    ctx.fillRect(Math.round(x), Math.round(GROUND_Y - h), w, Math.ceil(h));
  }
}

function drawGroundGrid(ctx: CanvasRenderingContext2D, distance: number): void {
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, GROUND_Y, SCREEN.w, VIRTUAL_H - GROUND_Y);

  // Perspective floor lines receding toward the ground line.
  ctx.strokeStyle = alpha(PALETTE.groundLine, 0.16);
  ctx.lineWidth = 1;
  const spacing = 48;
  const offset = wrap(distance, spacing);
  ctx.beginPath();
  for (let x = -offset; x < SCREEN.w + spacing; x += spacing) {
    ctx.moveTo(Math.round(x) + 0.5, GROUND_Y);
    ctx.lineTo(Math.round(x) - 60 + 0.5, VIRTUAL_H);
  }
  for (let y = GROUND_Y + 8; y < VIRTUAL_H; y += 14) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(SCREEN.w, y + 0.5);
  }
  ctx.stroke();

  // The glowing horizon line the player runs along.
  ctx.strokeStyle = alpha(PALETTE.groundLine, 0.28);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 0.5);
  ctx.lineTo(SCREEN.w, GROUND_Y + 0.5);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.groundLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 0.5);
  ctx.lineTo(SCREEN.w, GROUND_Y + 0.5);
  ctx.stroke();
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}
