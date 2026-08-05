import type { Renderer } from './renderer';
import { activeTheme } from './theme';
import { drawHud } from '../ui/hud';
import { drawScreens } from '../ui/screens';
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

    drawHud(ctx, state);
    drawTouchpad(ctx, input, state);
    drawScreens(ctx, state);
  },
};
