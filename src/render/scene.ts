import { updateEnvironment } from './environment';
import type { Renderer } from './renderer';
import { activeTheme } from './theme';
import { drawHud } from '../ui/hud';
import { drawGameOver, drawTitle } from '../ui/screens';
import type { GameState } from '../game/state';
import { juice } from './juice';
import { drawTouchpad } from '../ui/touchpad';

/**
 * Draws a frame using whichever theme is active.
 *
 * The layer order and the screenshake live here rather than in any theme,
 * because they're rules about the *game*, not about how it looks: hazards must
 * always draw over the background, the player over the hazards, and the
 * controls must never shake under the player's thumb. A theme that could
 * reorder those could quietly make the game unreadable.
 */
export const sceneRenderer: Renderer = {
  draw(ctx, state, input, interpolation, particles) {
    const theme = activeTheme();

    // Advance the time-of-day cycle before anything draws. It writes the world
    // colours into the live palette, so it has to happen ahead of the first
    // read of PALETTE.skyTop — which is the very first thing a background does.
    // The title screen sits at t=0 so the theme is shown at its most
    // recognisable rather than at whatever hour the last run ended at. The
    // game-over screen deliberately does *not* reset — snapping back to dawn
    // the instant you die would undo the run in front of you.
    updateEnvironment(theme.environments, state.phase === 'title' ? 0 : state.elapsed);

    ctx.save();

    // Screenshake is applied to the world only — the HUD and buttons are drawn
    // after this restore, so the controls stay put under the player's thumb.
    if (state.shake > 0.05) {
      const angle = state.elapsed * 90;
      ctx.translate(Math.sin(angle) * state.shake, Math.cos(angle * 1.7) * state.shake * 0.6);
    }

    theme.background(ctx, state, interpolation);
    theme.boss(ctx, state, interpolation);
    theme.obstacles(ctx, state, interpolation);
    theme.pickups(ctx, state, interpolation);
    theme.shots(ctx, state, interpolation);
    theme.player(ctx, state, interpolation);
    particles.draw(ctx);

    ctx.restore();

    if (juice.showHitboxes) drawHitboxes(ctx, state);

    drawHud(ctx, state);
    drawTouchpad(ctx, input, state);
    drawScreensWithFades(ctx, state);
  },
};

/**
 * Menus fade rather than cut: the title picture dissolves into the run (so
 * the first hazard isn't the first thing you see), and the game-over card
 * fades in over the moment it happened.
 */
const TITLE_FADE = 0.55;
const GAMEOVER_FADE = 0.4;
let shownPhase: GameState['phase'] = 'title';
let phaseSince = 0;
let previousPhase: GameState['phase'] = 'title';
let lastDrawn = 0;

function drawScreensWithFades(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.phase !== shownPhase) {
    previousPhase = shownPhase;
    shownPhase = state.phase;
    // If nothing was drawn for a while (a hidden tab, a test driving the loop
    // directly) the change is old news: show the new screen without a fade.
    phaseSince = juice.time - lastDrawn > 0.25 ? -Infinity : juice.time;
  }
  lastDrawn = juice.time;
  const t = juice.time - phaseSince;
  ctx.save();
  if (state.phase === 'title') {
    drawTitle(ctx, state);
  } else if (state.phase === 'gameover') {
    ctx.globalAlpha = Math.min(1, t / GAMEOVER_FADE);
    drawGameOver(ctx, state);
  } else if (previousPhase === 'title' && t < TITLE_FADE) {
    ctx.globalAlpha = 1 - t / TITLE_FADE;
    drawTitle(ctx, state);
  }
  ctx.restore();
}

/** Dev overlay: every hitbox, so art can be checked against the rule that it never overhangs. */
function drawHitboxes(ctx: CanvasRenderingContext2D, state: GameState): void {
  const box = { x: 0, y: 0, w: 0, h: 0 };
  ctx.save();
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = '#00ffff';
  state.player.bounds(box);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = '#ff00ff';
  for (const item of state.obstacles.items) {
    if (item.active) ctx.strokeRect(item.x, item.y, item.w, item.h);
  }
  if (state.boss.active) {
    state.boss.bounds(box);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
  ctx.restore();
}
