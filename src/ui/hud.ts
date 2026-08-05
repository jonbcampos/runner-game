import { SCREEN, VIRTUAL_H } from '../game/config';
import type { GameState } from '../game/state';
import { POWERUP_DEFS } from '../game/powerups';
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

  drawText(ctx, `SECTOR ${state.sector}`, SCREEN.w - 8, 14, {
    size: 9,
    color: PALETTE.hudDim,
    align: 'right',
  });

  drawHearts(ctx, state);
  drawPowerupTimer(ctx, state);
  drawBossBar(ctx, state);
  drawSectorAnnouncement(ctx, state);
}

/**
 * The active powerup and its remaining time.
 *
 * A draining bar rather than a number, because the only thing you need mid-run
 * is "how much longer", answered by glance rather than by reading. Risky
 * powerups are drawn in hazard pink so a bad state is never mistaken for a
 * good one.
 */
function drawPowerupTimer(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.powerupFlash > 0 && state.powerupFlashKind) {
    const def = POWERUP_DEFS[state.powerupFlashKind];
    const fade = Math.min(1, state.powerupFlash / 0.4);
    ctx.save();
    ctx.globalAlpha = fade;
    drawText(ctx, def.blurb, SCREEN.w / 2, VIRTUAL_H / 2 + 22, {
      size: 10,
      color: def.risky ? PALETTE.spike : PALETTE.shot,
      align: 'center',
      glow: true,
    });
    ctx.restore();
  }

  if (!state.activePowerup) return;
  const def = POWERUP_DEFS[state.activePowerup];
  const colour = def.risky ? PALETTE.spike : PALETTE.shot;
  const w = 84;
  const x = SCREEN.w / 2 - w / 2;
  const y = VIRTUAL_H - 16;

  drawText(ctx, def.label, SCREEN.w / 2, y - 7, { size: 8, color: colour, align: 'center' });

  ctx.fillStyle = alpha(colour, 0.18);
  ctx.fillRect(x, y, w, 4);
  const remaining = Math.max(0, state.powerupRemaining / def.duration);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w * remaining, 4);

  // Flash the bar in the last second, so it running out is never a surprise.
  if (state.powerupRemaining < 1) {
    ctx.fillStyle = alpha(PALETTE.playerCore, 0.5 + Math.sin(state.elapsed * 24) * 0.5);
    ctx.fillRect(x, y, w * remaining, 4);
  }
}

/**
 * Boss health, across the top.
 *
 * Segmented rather than a smooth bar: with only ~10 hits in the fight, discrete
 * pips let you count exactly how many more openings you need, which turns the
 * fight into a plan instead of a guess.
 */
function drawBossBar(ctx: CanvasRenderingContext2D, state: GameState): void {
  const boss = state.boss;
  if (!boss.active || boss.phase === 'dying') return;

  const barW = Math.min(220, SCREEN.w - 120);
  const x = SCREEN.w / 2 - barW / 2;
  const y = 44;
  const segments = boss.maxHp;
  const gap = 1;
  const segW = (barW - gap * (segments - 1)) / segments;

  drawText(ctx, 'SENTINEL', SCREEN.w / 2, y - 9, {
    size: 8,
    color: PALETTE.drone,
    align: 'center',
  });

  for (let i = 0; i < segments; i++) {
    const sx = x + i * (segW + gap);
    if (i < boss.hp) {
      ctx.fillStyle = boss.hitFlash > 0 ? PALETTE.playerCore : PALETTE.drone;
      ctx.fillRect(sx, y, segW, 5);
    } else {
      ctx.fillStyle = alpha(PALETTE.drone, 0.18);
      ctx.fillRect(sx, y, segW, 5);
    }
  }

  // Name the opening. Without this the vulnerable window reads as random.
  if (boss.vulnerable) {
    drawText(ctx, 'CORE EXPOSED — FIRE', SCREEN.w / 2, y + 15, {
      size: 8,
      color: PALETTE.shot,
      align: 'center',
      glow: true,
    });
  }
}

/**
 * Big centred callout when a new sector begins.
 *
 * The game speeds up and tightens continuously, which is right, but continuous
 * change is invisible — it just feels like you got worse. Naming the moment
 * turns "this is harder now" into information instead of frustration.
 */
function drawSectorAnnouncement(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.bossVictoryFlash > 0) {
    const fade = Math.min(1, state.bossVictoryFlash / 0.5);
    ctx.save();
    ctx.globalAlpha = fade;
    drawText(ctx, 'SENTINEL DOWN', SCREEN.w / 2, VIRTUAL_H / 2 - 30, {
      size: 20,
      color: PALETTE.shot,
      align: 'center',
      glow: true,
    });
    ctx.restore();
    return;
  }
  if (state.sectorFlash <= 0 || state.sector <= 1) return;

  // Fade in fast, hold, then fade out over the last third.
  const t = state.sectorFlash / 1.8;
  const fade = t > 0.75 ? (1 - t) / 0.25 : Math.min(1, t / 0.33);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, fade));
  drawText(ctx, `SECTOR ${state.sector}`, SCREEN.w / 2, VIRTUAL_H / 2 - 30, {
    size: 22,
    color: PALETTE.hudAccent,
    align: 'center',
    glow: true,
  });
  drawText(ctx, 'FASTER', SCREEN.w / 2, VIRTUAL_H / 2 - 10, {
    size: 9,
    color: PALETTE.hudDim,
    align: 'center',
  });
  ctx.restore();
}

function drawHearts(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { hp, maxHp } = state.player;
  const size = 7;
  const gap = 4;
  const totalW = maxHp * size + (maxHp - 1) * gap;
  const startX = SCREEN.w - 8 - totalW;
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
