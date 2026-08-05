import { VIRTUAL_W } from '../game/config';
import type { GameState } from '../game/state';
import { PALETTE, alpha } from '../render/palette';
import { drawText } from './text';

/**
 * Distance, health, and sector.
 *
 * Kept to the top strip and deliberately low-contrast: during a run the
 * player's eyes belong on the incoming hazards, not on the numbers. The HUD is
 * for the half-second after you die, when you want to know how you did.
 */
export function drawHud(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase === 'title') return;

  drawText(ctx, `${state.metres}m`, 8, 14, {
    size: 14,
    color: PALETTE.hudText,
    glow: true,
  });

  if (state.best > 0) {
    drawText(ctx, `BEST ${state.best}m`, 8, 28, { size: 8, color: PALETTE.hudDim });
  }

  drawText(ctx, `SECTOR ${state.sector}`, VIRTUAL_W - 8, 14, {
    size: 9,
    color: PALETTE.hudDim,
    align: 'right',
  });

  drawHearts(ctx, state);
}

function drawHearts(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { hp, maxHp } = state.player;
  const size = 7;
  const gap = 4;
  const totalW = maxHp * size + (maxHp - 1) * gap;
  const startX = VIRTUAL_W - 8 - totalW;
  const y = 26;

  for (let i = 0; i < maxHp; i++) {
    const x = startX + i * (size + gap);
    const filled = i < hp;
    if (filled) {
      ctx.fillStyle = alpha(PALETTE.player, 0.25);
      ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
      ctx.fillStyle = PALETTE.player;
      ctx.fillRect(x, y, size, size);
    } else {
      ctx.strokeStyle = PALETTE.hudDim;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }
  }
}
