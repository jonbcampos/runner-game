import { DIFFICULTIES, VIRTUAL_H, SCREEN, type DifficultyId } from '../game/config';
import { SOLVED_BY } from '../game/obstacles';
import type { GameState } from '../game/state';
import { PALETTE, alpha } from '../render/palette';
import { drawGameOverEllie, drawTitleArt } from '../render/rainbow-art';
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
  // Wide enough for the longest subtitle ("2 HP · JUMP FIRE SLIDE").
  const w = 148;
  const h = 30;
  const gap = 10;
  const totalH = DIFFICULTY_ORDER.length * h + (DIFFICULTY_ORDER.length - 1) * gap;
  const startY = VIRTUAL_H / 2 - totalH / 2 + 26;

  return DIFFICULTY_ORDER.map((id, i) => ({
    id,
    label: DIFFICULTIES[id].label,
    sub: `${DIFFICULTIES[id].hp} HP  ·  ${verbList(id)}`,
    x: SCREEN.w / 2 - w / 2,
    y: startY + i * (h + gap),
    w,
    h,
  }));
}

/**
 * The verbs a difficulty actually asks for, spelled out on its button.
 *
 * The modes differ in *what you have to think about* before they differ in
 * speed, and that's invisible from a name and an HP count. A parent picking
 * a mode for a small child should be able to see "two buttons" without
 * playing it first.
 */
function verbList(id: DifficultyId): string {
  const verbs = new Set(DIFFICULTIES[id].allowedKinds.map((kind) => SOLVED_BY[kind]));
  const names = ['JUMP', 'FIRE'];
  if (verbs.has('slide')) names.push('SLIDE');
  return names.join(' ');
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

/** Music toggle, next to the sound toggle. Separate, because a parent may want one without the other. */
export function musicButton(): { x: number; y: number; w: number; h: number } {
  return { x: 78, y: VIRTUAL_H - 26, w: 62, h: 18 };
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
let musicMutedForDisplay = false;
export function setMusicMutedDisplay(muted: boolean): void {
  musicMutedForDisplay = muted;
}

/** True when the menus sit on the painted title picture rather than the world. */
let painted = false;

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

/** A small outlined toggle; on the painted title it gets a white backing so it reads. */
function drawToggle(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  label: string,
  on: boolean,
): void {
  if (painted) {
    ctx.fillStyle = alpha('#ffffff', 0.8);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.strokeStyle = alpha(PALETTE.hudDim, 0.8);
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, {
    size: 8,
    color: on ? PALETTE.hudAccent : PALETTE.hudDim,
    align: 'center',
  });
}

function drawSoundToggles(ctx: CanvasRenderingContext2D): void {
  drawToggle(ctx, muteButton(), mutedForDisplay ? 'SOUND OFF' : 'SOUND ON', !mutedForDisplay);
  drawToggle(ctx, musicButton(), musicMutedForDisplay ? 'MUSIC OFF' : 'MUSIC ON', !musicMutedForDisplay);
}

export function drawTitle(ctx: CanvasRenderingContext2D, state: GameState): void {
  // The RAINBOW theme opens on its painted picture, with Ellie waving; without
  // the art (or on NEON) it's the world behind a scrim, as it always was.
  painted = activeTheme().id === 'unicorn' && drawTitleArt(ctx);
  ctx.fillStyle = alpha(PALETTE.scrim, painted ? 0.12 : 0.62);
  ctx.fillRect(0, 0, SCREEN.w, VIRTUAL_H);
  const outline = painted ? '#ffffff' : undefined;

  drawText(ctx, "ELLIE'S", SCREEN.w / 2, 30, {
    size: 14,
    color: PALETTE.hudAccent,
    align: 'center',
    glow: true,
    outline,
  });
  drawText(ctx, 'RAINBOW RUN', SCREEN.w / 2, 52, {
    size: 26,
    color: PALETTE.player,
    align: 'center',
    glow: true,
    outline,
  });
  drawText(ctx, 'JUMP  ·  SHOOT  ·  SLIDE', SCREEN.w / 2, 70, {
    size: 9,
    color: painted ? PALETTE.hudText : PALETTE.hudDim,
    align: 'center',
    outline,
  });

  for (const rect of titleMenu()) {
    drawMenuButton(ctx, rect, PALETTE.player);
  }

  if (state.best > 0) {
    drawText(ctx, `BEST  ${state.best}m`, SCREEN.w / 2, VIRTUAL_H - 18, {
      size: 9,
      color: painted ? PALETTE.hudText : PALETTE.hudDim,
      align: 'center',
      outline,
    });
  }

  drawSoundToggles(ctx);

  const theme = themeButton();
  drawToggle(ctx, theme, activeTheme().label, true);

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

export function drawGameOver(ctx: CanvasRenderingContext2D, state: GameState): void {
  painted = false;
  ctx.fillStyle = alpha(PALETTE.scrim, 0.72);
  ctx.fillRect(0, 0, SCREEN.w, VIRTUAL_H);

  const isBest = state.metres >= state.best && state.metres > 0;
  // Ellie sits down, dizzy but grinning, on the RAINBOW theme: nobody is hurt.
  const rainbow =
    activeTheme().id === 'unicorn' && drawGameOverEllie(ctx, SCREEN.w / 2 - 150, VIRTUAL_H / 2 + 52);

  drawText(ctx, rainbow ? 'OOPSIE!' : 'WRECKED', SCREEN.w / 2, VIRTUAL_H / 2 - 46, {
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
  drawSoundToggles(ctx);
}

function drawMenuButton(ctx: CanvasRenderingContext2D, rect: MenuRect, color: string): void {
  // On the painted title a faint tint vanishes into the picture: a solid
  // candy button with a white label instead.
  ctx.fillStyle = painted ? alpha(color, 0.92) : alpha(color, 0.12);
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
      color: painted ? '#ffffff' : alpha(color, 0.8),
      align: 'center',
    });
  }
}
