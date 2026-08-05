import { GROUND_Y, VIRTUAL_H, VIRTUAL_W } from '../game/config';
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
export function drawBackground(ctx: CanvasRenderingContext2D, distance: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

  drawStars(ctx, distance * 0.05);
  drawSkyline(ctx, distance * 0.18, 0.55, PALETTE.farGrid, 34, 78);
  drawSkyline(ctx, distance * 0.38, 0.75, PALETTE.midStructure, 52, 58);
  drawGroundGrid(ctx, distance);
}

function drawStars(ctx: CanvasRenderingContext2D, offset: number): void {
  ctx.fillStyle = alpha(PALETTE.hudText, 0.35);
  // Deterministic pseudo-star field: cheap hash of the index, no allocation.
  for (let i = 0; i < 40; i++) {
    const seed = i * 2654435761;
    const baseX = (seed >>> 8) % (VIRTUAL_W * 2);
    const y = ((seed >>> 3) % 120) + 8;
    const x = wrap(baseX - offset, VIRTUAL_W * 2);
    if (x > VIRTUAL_W) continue;
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
  const span = VIRTUAL_W + period * 2;
  const start = Math.floor(offset / period) * period;

  for (let i = 0; i * spacing < span; i++) {
    const worldX = start + i * spacing;
    const x = worldX - offset;
    if (x > VIRTUAL_W || x < -period) continue;

    const seed = Math.abs(Math.floor(worldX / spacing)) * 2246822519;
    const h = (((seed >>> 5) % maxHeight) + 18) * heightScale;
    const w = ((seed >>> 11) % 22) + 14;
    ctx.fillRect(Math.round(x), Math.round(GROUND_Y - h), w, Math.ceil(h));
  }
}

function drawGroundGrid(ctx: CanvasRenderingContext2D, distance: number): void {
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, GROUND_Y, VIRTUAL_W, VIRTUAL_H - GROUND_Y);

  // Perspective floor lines receding toward the ground line.
  ctx.strokeStyle = alpha(PALETTE.groundLine, 0.16);
  ctx.lineWidth = 1;
  const spacing = 48;
  const offset = wrap(distance, spacing);
  ctx.beginPath();
  for (let x = -offset; x < VIRTUAL_W + spacing; x += spacing) {
    ctx.moveTo(Math.round(x) + 0.5, GROUND_Y);
    ctx.lineTo(Math.round(x) - 60 + 0.5, VIRTUAL_H);
  }
  for (let y = GROUND_Y + 8; y < VIRTUAL_H; y += 14) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(VIRTUAL_W, y + 0.5);
  }
  ctx.stroke();

  // The glowing horizon line the player runs along.
  ctx.strokeStyle = alpha(PALETTE.groundLine, 0.28);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 0.5);
  ctx.lineTo(VIRTUAL_W, GROUND_Y + 0.5);
  ctx.stroke();

  ctx.strokeStyle = PALETTE.groundLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 0.5);
  ctx.lineTo(VIRTUAL_W, GROUND_Y + 0.5);
  ctx.stroke();
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}
