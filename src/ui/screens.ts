import { DIFFICULTIES, VIRTUAL_H, VIRTUAL_W, type DifficultyId } from '../game/config';
import type { GameState } from '../game/state';
import { PALETTE, alpha } from '../render/palette';
import { drawText } from './text';

export interface MenuRect {
  id: DifficultyId | 'restart' | 'menu';
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
}

const DIFFICULTY_ORDER: readonly DifficultyId[] = ['kid', 'normal', 'hard'];

/**
 * Menu hit regions, defined once and used by both the renderer and the input
 * router in main.ts. Deriving both from the same list means a button can never
 * end up drawn somewhere other than where it's tappable.
 */
export function titleMenu(): MenuRect[] {
  const w = 108;
  const h = 30;
  const gap = 10;
  const totalH = DIFFICULTY_ORDER.length * h + (DIFFICULTY_ORDER.length - 1) * gap;
  const startY = VIRTUAL_H / 2 - totalH / 2 + 26;

  return DIFFICULTY_ORDER.map((id, i) => ({
    id,
    label: DIFFICULTIES[id].label,
    sub: `${DIFFICULTIES[id].hp} HP`,
    x: VIRTUAL_W / 2 - w / 2,
    y: startY + i * (h + gap),
    w,
    h,
  }));
}

export function gameOverMenu(): MenuRect[] {
  const w = 96;
  const h = 28;
  return [
    {
      id: 'restart',
      label: 'RETRY',
      x: VIRTUAL_W / 2 - w - 6,
      y: VIRTUAL_H / 2 + 30,
      w,
      h,
    },
    {
      id: 'menu',
      label: 'MENU',
      x: VIRTUAL_W / 2 + 6,
      y: VIRTUAL_H / 2 + 30,
      w,
      h,
    },
  ];
}

export function hitTestMenu(rects: readonly MenuRect[], x: number, y: number): MenuRect | null {
  // Generous vertical padding — menu taps are less precise than game inputs and
  // there's no cost to being forgiving here.
  const pad = 6;
  for (const rect of rects) {
    if (
      x >= rect.x - pad &&
      x <= rect.x + rect.w + pad &&
      y >= rect.y - pad &&
      y <= rect.y + rect.h + pad
    ) {
      return rect;
    }
  }
  return null;
}

export function drawScreens(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase === 'title') drawTitle(ctx, state);
  else if (state.phase === 'gameover') drawGameOver(ctx, state);
}

function drawTitle(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = alpha(PALETTE.skyTop, 0.72);
  ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

  drawText(ctx, 'THREE VERBS', VIRTUAL_W / 2, 44, {
    size: 26,
    color: PALETTE.player,
    align: 'center',
    glow: true,
  });
  drawText(ctx, 'JUMP  ·  SHOOT  ·  SLIDE', VIRTUAL_W / 2, 64, {
    size: 9,
    color: PALETTE.hudDim,
    align: 'center',
  });

  for (const rect of titleMenu()) {
    drawMenuButton(ctx, rect, PALETTE.player);
  }

  if (state.best > 0) {
    drawText(ctx, `BEST  ${state.best}m`, VIRTUAL_W / 2, VIRTUAL_H - 18, {
      size: 9,
      color: PALETTE.hudDim,
      align: 'center',
    });
  }
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = alpha(PALETTE.skyTop, 0.78);
  ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

  const isBest = state.metres >= state.best && state.metres > 0;

  drawText(ctx, 'WRECKED', VIRTUAL_W / 2, VIRTUAL_H / 2 - 46, {
    size: 22,
    color: PALETTE.spike,
    align: 'center',
    glow: true,
  });
  drawText(ctx, `${state.metres}m`, VIRTUAL_W / 2, VIRTUAL_H / 2 - 14, {
    size: 30,
    color: PALETTE.hudText,
    align: 'center',
    glow: true,
  });
  drawText(
    ctx,
    isBest ? 'NEW BEST' : `BEST  ${state.best}m`,
    VIRTUAL_W / 2,
    VIRTUAL_H / 2 + 10,
    {
      size: 9,
      color: isBest ? PALETTE.shot : PALETTE.hudDim,
      align: 'center',
    },
  );

  for (const rect of gameOverMenu()) {
    drawMenuButton(ctx, rect, rect.id === 'restart' ? PALETTE.player : PALETTE.hudDim);
  }
}

function drawMenuButton(ctx: CanvasRenderingContext2D, rect: MenuRect, color: string): void {
  ctx.fillStyle = alpha(color, 0.12);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = alpha(color, 0.85);
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  const hasSub = Boolean(rect.sub);
  drawText(ctx, rect.label, rect.x + rect.w / 2, rect.y + rect.h / 2 - (hasSub ? 4 : 0), {
    size: 12,
    color: PALETTE.hudText,
    align: 'center',
  });
  if (rect.sub) {
    drawText(ctx, rect.sub, rect.x + rect.w / 2, rect.y + rect.h / 2 + 8, {
      size: 7,
      color: alpha(color, 0.8),
      align: 'center',
    });
  }
}
