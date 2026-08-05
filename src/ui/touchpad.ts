import { VIRTUAL_H, SCREEN } from '../game/config';
import type { Action, Input } from '../core/input';
import type { GameState } from '../game/state';
import { PALETTE, alpha } from '../render/palette';
import { drawText } from './text';

export interface TouchButton {
  action: Action;
  label: string;
  /** Center + radius, in virtual pixels. Circles hit-test cleanly with a thumb. */
  cx: number;
  cy: number;
  r: number;
  /** Extra invisible radius. Thumbs are imprecise; a miss feels like a bug. */
  touchPadding: number;
}

/**
 * Two-handed layout: SHOOT under the left thumb, JUMP and SLIDE under the
 * right. Jump sits higher and larger than slide because it's the most-used and
 * most timing-critical verb.
 *
 * These are drawn on the canvas rather than as DOM elements so they scale with
 * the letterbox transform automatically and so every input — button presses and
 * gameplay taps alike — flows through one pointer pipeline.
 */
function buildButtons(): TouchButton[] {
  return [
    {
      action: 'shoot',
      label: 'FIRE',
      cx: 46,
      cy: VIRTUAL_H - 42,
      r: 26,
      touchPadding: 12,
    },
    {
      action: 'jump',
      label: 'JUMP',
      cx: SCREEN.w - 44,
      cy: VIRTUAL_H - 56,
      r: 28,
      touchPadding: 12,
    },
    {
      action: 'slide',
      label: 'SLIDE',
      cx: SCREEN.w - 104,
      cy: VIRTUAL_H - 34,
      r: 22,
      touchPadding: 10,
    },
  ];
}

let cachedWidth = -1;
let cachedButtons: TouchButton[] = [];

/**
 * Button layout for the current frame width.
 *
 * Memoised on width rather than rebuilt per call: this runs once per frame for
 * drawing and again on every pointer event, and allocating three objects each
 * time is exactly the kind of steady garbage that shows up as a frame hitch.
 */
export function touchButtons(): readonly TouchButton[] {
  if (cachedWidth !== SCREEN.w) {
    cachedWidth = SCREEN.w;
    cachedButtons = buildButtons();
  }
  return cachedButtons;
}

export function hitTestButton(x: number, y: number): TouchButton | null {
  for (const button of touchButtons()) {
    const dx = x - button.cx;
    const dy = y - button.cy;
    const reach = button.r + button.touchPadding;
    if (dx * dx + dy * dy <= reach * reach) return button;
  }
  return null;
}

/**
 * Draw the controls.
 *
 * They sit at low opacity so they don't compete with the gameplay, and light up
 * hard on press. That press feedback isn't decoration: when an input doesn't
 * work, it's the only way the player can tell whether the game missed the touch
 * or they simply chose the wrong verb.
 */
export function drawTouchpad(
  ctx: CanvasRenderingContext2D,
  input: Input,
  state: GameState,
): void {
  if (state.phase !== 'playing') return;

  for (const button of touchButtons()) {
    const pressed = input.down[button.action];
    const fill = pressed ? alpha(PALETTE.buttonActive, 0.3) : alpha(PALETTE.buttonIdle, 0.42);
    const edge = pressed ? PALETTE.buttonActive : alpha(PALETTE.buttonEdge, 0.65);

    if (pressed) {
      ctx.fillStyle = alpha(PALETTE.buttonActive, 0.12);
      ctx.beginPath();
      ctx.arc(button.cx, button.cy, button.r + 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(button.cx, button.cy, button.r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = pressed ? 2 : 1;
    ctx.stroke();

    drawText(ctx, button.label, button.cx, button.cy, {
      size: button.r > 24 ? 10 : 8,
      color: pressed ? PALETTE.playerCore : alpha(PALETTE.hudText, 0.7),
      align: 'center',
    });
  }
}
