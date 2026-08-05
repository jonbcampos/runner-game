import { DIFFICULTIES, VIRTUAL_H, SCREEN, type DifficultyId } from '../game/config';
import type { GameState } from '../game/state';
import { PALETTE, alpha } from '../render/palette';
import { activeTheme } from '../render/theme';
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
    x: SCREEN.w / 2 - w / 2,
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
      x: SCREEN.w / 2 - w - 6,
      y: VIRTUAL_H / 2 + 30,
      w,
      h,
    },
    {
      id: 'menu',
      label: 'MENU',
      x: SCREEN.w / 2 + 6,
      y: VIRTUAL_H / 2 + 30,
      w,
      h,
    },
  ];
}

/** Sound toggle, bottom-left of the title screen. */
export function muteButton(): { x: number; y: number; w: number; h: number } {
  return { x: 10, y: VIRTUAL_H - 26, w: 62, h: 18 };
}

/** Theme cycler, bottom-right of the title screen. */
export function themeButton(): { x: number; y: number; w: number; h: number } {
  return { x: SCREEN.w - 82, y: VIRTUAL_H - 26, w: 72, h: 18 };
}

/**
 * Mirror of the audio mute flag, for drawing.
 *
 * Pushed in rather than read from storage each frame — this is drawn 60 times a
 * second and localStorage reads are synchronous.
 */
let mutedForDisplay = false;
export function setMutedDisplay(muted: boolean): void {
  mutedForDisplay = muted;
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
  ctx.fillStyle = alpha(PALETTE.scrim, 0.62);
  ctx.fillRect(0, 0, SCREEN.w, VIRTUAL_H);

  drawText(ctx, "ELLIE'S", SCREEN.w / 2, 30, {
    size: 14,
    color: PALETTE.hudAccent,
    align: 'center',
    glow: true,
  });
  drawText(ctx, 'RAINBOW RUN', SCREEN.w / 2, 52, {
    size: 26,
    color: PALETTE.player,
    align: 'center',
    glow: true,
  });
  drawText(ctx, 'JUMP  ·  SHOOT  ·  SLIDE', SCREEN.w / 2, 70, {
    size: 9,
    color: PALETTE.hudDim,
    align: 'center',
  });

  for (const rect of titleMenu()) {
    drawMenuButton(ctx, rect, PALETTE.player);
  }

  if (state.best > 0) {
    drawText(ctx, `BEST  ${state.best}m`, SCREEN.w / 2, VIRTUAL_H - 18, {
      size: 9,
      color: PALETTE.hudDim,
      align: 'center',
    });
  }

  const mute = muteButton();
  ctx.strokeStyle = alpha(PALETTE.hudDim, 0.7);
  ctx.lineWidth = 1;
  ctx.strokeRect(mute.x + 0.5, mute.y + 0.5, mute.w - 1, mute.h - 1);
  drawText(
    ctx,
    mutedForDisplay ? 'SOUND OFF' : 'SOUND ON',
    mute.x + mute.w / 2,
    mute.y + mute.h / 2,
    {
      size: 8,
      color: mutedForDisplay ? PALETTE.hudDim : PALETTE.hudAccent,
      align: 'center',
    },
  );

  const theme = themeButton();
  ctx.strokeStyle = alpha(PALETTE.hudDim, 0.7);
  ctx.lineWidth = 1;
  ctx.strokeRect(theme.x + 0.5, theme.y + 0.5, theme.w - 1, theme.h - 1);
  drawText(ctx, activeTheme().label, theme.x + theme.w / 2, theme.y + theme.h / 2, {
    size: 8,
    color: PALETTE.hudAccent,
    align: 'center',
  });

  // In portrait the game is drawn sideways to fill the screen, which only makes
  // sense once you turn the phone. Say so, and say which way — the rotation
  // direction is fixed, so guessing wrong means playing upside down.
  if (SCREEN.rotated) {
    drawText(ctx, '↺  TURN YOUR PHONE LEFT', SCREEN.w / 2, VIRTUAL_H - 34, {
      size: 10,
      color: PALETTE.shot,
      align: 'center',
      glow: true,
    });
  }
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = alpha(PALETTE.scrim, 0.72);
  ctx.fillRect(0, 0, SCREEN.w, VIRTUAL_H);

  const isBest = state.metres >= state.best && state.metres > 0;

  drawText(ctx, 'WRECKED', SCREEN.w / 2, VIRTUAL_H / 2 - 46, {
    size: 22,
    color: PALETTE.spike,
    align: 'center',
    glow: true,
  });
  drawText(ctx, `${state.metres}m`, SCREEN.w / 2, VIRTUAL_H / 2 - 14, {
    size: 30,
    color: '#ffffff',
    align: 'center',
    glow: true,
  });
  drawText(
    ctx,
    isBest ? 'NEW BEST' : `BEST  ${state.best}m`,
    SCREEN.w / 2,
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
    color: '#ffffff',
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
