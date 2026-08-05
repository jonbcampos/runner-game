import { GROUND_Y, OBSTACLE, POWERUP, SHOT, VIRTUAL_H, SCREEN } from '../game/config';
import { POWERUP_DEFS } from '../game/powerups';
import type { Aabb } from '../game/collision';
import type { Obstacle } from '../game/obstacles';
import type { GameState } from '../game/state';
import type { Renderer } from './renderer';
import { drawBackground } from './parallax';
import { PALETTE, alpha } from './palette';
import { drawHud } from '../ui/hud';
import { drawText } from '../ui/text';
import { drawScreens } from '../ui/screens';
import { drawTouchpad } from '../ui/touchpad';

const scratch: Aabb = { x: 0, y: 0, w: 0, h: 0 };

export const neonRenderer: Renderer = {
  draw(ctx, state, input, interpolation, particles) {
    ctx.save();

    // Screenshake is applied to the world only — the HUD and buttons are drawn
    // after this restore, so the controls never jitter under the player's thumb.
    if (state.shake > 0.05) {
      const angle = state.elapsed * 90;
      ctx.translate(Math.sin(angle) * state.shake, Math.cos(angle * 1.7) * state.shake * 0.6);
    }

    drawBackground(ctx, state.distance);
    drawBoss(ctx, state, interpolation);
    drawObstacles(ctx, state, interpolation);
    drawPickups(ctx, state, interpolation);
    drawShots(ctx, state, interpolation);
    drawPlayer(ctx, state, interpolation);
    particles.draw(ctx);

    ctx.restore();

    drawHud(ctx, state);
    drawTouchpad(ctx, input, state);
    drawScreens(ctx, state);
  },
};

/** Stacked translucent rects fake a bloom far more cheaply than shadowBlur. */
function glowRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  strength = 1,
): void {
  ctx.fillStyle = alpha(color, 0.1 * strength);
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.fillStyle = alpha(color, 0.22 * strength);
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  const player = state.player;

  // Invulnerability flicker. Skipping alternate short intervals reads as
  // "you're briefly intangible" without needing any extra art. Death sets
  // i-frames too, so the dead check has to come first or the corpse blinks out.
  if (!player.dead && player.invulnerable && Math.floor(state.elapsed * 20) % 2 === 0) return;

  player.bounds(scratch, interpolation);
  const { x, y, w, h } = scratch;

  if (player.dead) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(state.elapsed * 6);
    glowRect(ctx, -w / 2, -h / 2, w, h, PALETTE.spike);
    ctx.restore();
    return;
  }

  // Invincibility reads as a hard shell rather than as flicker, so it can't be
  // confused with the post-hit i-frame blink.
  if (state.invincible) {
    const pulse = 0.5 + Math.sin(state.elapsed * 14) * 0.3;
    ctx.fillStyle = alpha(PALETTE.shot, 0.25 * pulse);
    ctx.fillRect(x - 7, y - 7, w + 14, h + 14);
    ctx.strokeStyle = alpha(PALETTE.shot, pulse);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 5.5, y - 5.5, w + 11, h + 11);
  }

  // Flight thruster, pointing down so the lift is legible.
  if (player.pose === 'fly') {
    const flare = 6 + Math.sin(state.elapsed * 30) * 3;
    ctx.fillStyle = alpha(PALETTE.shot, 0.55);
    ctx.fillRect(x + 3, y + h, w - 6, flare);
    ctx.fillStyle = alpha(PALETTE.shot, 0.2);
    ctx.fillRect(x + 1, y + h, w - 2, flare + 5);
  }

  // Motion streak behind the player — strongest while sliding, which is when
  // the player is moving fastest relative to the ground.
  const streak = player.pose === 'slide' ? 22 : 10;
  ctx.fillStyle = alpha(PALETTE.player, player.pose === 'slide' ? 0.3 : 0.14);
  ctx.fillRect(x - streak, y + h * 0.25, streak, h * 0.5);

  glowRect(ctx, x, y, w, h, PALETTE.player);

  // Bright inner core plus a forward-facing visor, so the sprite reads as
  // having a front and therefore a direction of travel.
  ctx.fillStyle = PALETTE.playerCore;
  if (player.pose === 'slide') {
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  } else {
    ctx.fillRect(x + 3, y + 4, w - 6, h - 10);
    ctx.fillStyle = PALETTE.skyTop;
    ctx.fillRect(x + w - 7, y + 6, 4, 3);
  }

  // Running legs: a two-frame shuffle driven by distance so it stays in sync
  // with the ground scrolling past instead of drifting against it.
  if (player.pose === 'run') {
    const step = Math.floor(state.distance / 9) % 2;
    ctx.fillStyle = PALETTE.playerDim;
    ctx.fillRect(x + 2, y + h - 4, 5, 4);
    ctx.fillRect(x + w - 8 + step * 2, y + h - 4, 5, 4);
  }
}

function drawShots(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  for (const shot of state.shots.shots) {
    if (!shot.active) continue;
    const x = shot.prevX + (shot.x - shot.prevX) * interpolation;

    // Trailing tail sells the speed and makes near-misses legible.
    ctx.fillStyle = alpha(PALETTE.shot, 0.25);
    ctx.fillRect(x - 10, shot.y, 10, SHOT.height);
    glowRect(ctx, x, shot.y, SHOT.width, SHOT.height, PALETTE.shot);
    ctx.fillStyle = PALETTE.shotCore;
    ctx.fillRect(x + 2, shot.y + 1, SHOT.width - 4, 1);
  }
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  interpolation: number,
): void {
  for (const item of state.obstacles.items) {
    if (!item.active) continue;
    const x = item.prevX + (item.x - item.prevX) * interpolation;

    if (item.deathTimer > 0) {
      drawDeath(ctx, item, x);
      continue;
    }

    switch (item.kind) {
      case 'spike':
        drawSpike(ctx, x, item);
        break;
      case 'beam':
        drawBeam(ctx, x, item, state.elapsed);
        break;
      case 'drone':
        drawDrone(ctx, x, item, state.elapsed);
        break;
      case 'skydrone':
        drawSkyDrone(ctx, x, item, state.elapsed);
        break;
    }
  }
}

/** Ground hazard. Sawtooth silhouette reads as "don't touch" instantly. */
function drawSpike(ctx: CanvasRenderingContext2D, x: number, item: Obstacle): void {
  const baseY = item.y + item.h;
  ctx.fillStyle = alpha(PALETTE.spike, 0.18);
  ctx.fillRect(x - 3, item.y - 3, item.w + 6, item.h + 3);

  ctx.fillStyle = PALETTE.spike;
  ctx.beginPath();
  const teeth = 3;
  const toothW = item.w / teeth;
  for (let i = 0; i < teeth; i++) {
    const left = x + i * toothW;
    ctx.moveTo(left, baseY);
    ctx.lineTo(left + toothW / 2, item.y);
    ctx.lineTo(left + toothW, baseY);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = alpha(PALETTE.playerCore, 0.7);
  ctx.fillRect(x, baseY - 2, item.w, 2);
}

/** Overhead beam. The empty gap beneath it is the visual instruction to slide. */
function drawBeam(ctx: CanvasRenderingContext2D, x: number, item: Obstacle, time: number): void {
  glowRect(ctx, x, item.y, item.w, item.h, PALETTE.beam, 0.8);

  // Scanlines crawling down the emitter make it read as active energy rather
  // than as a solid block you might be able to land on.
  ctx.fillStyle = alpha(PALETTE.playerCore, 0.35);
  for (let i = 0; i < 4; i++) {
    const offset = (time * 40 + i * 15) % item.h;
    ctx.fillRect(x + 2, item.y + offset, item.w - 4, 1);
  }

  // A bright lip on the underside marks exactly where the danger stops.
  ctx.fillStyle = PALETTE.playerCore;
  ctx.fillRect(x - 2, item.y + item.h - 2, item.w + 4, 2);
  ctx.fillStyle = alpha(PALETTE.beam, 0.25);
  ctx.fillRect(x + 4, item.y + item.h, item.w - 8, OBSTACLE.beam.clearance);
}

/** Drone body up top, shield column beneath. Both parts die when the body does. */
function drawDrone(ctx: CanvasRenderingContext2D, x: number, item: Obstacle, time: number): void {
  const tint = PALETTE.droneTier[item.maxHp] ?? PALETTE.drone;
  const bodyH = OBSTACLE.drone.bodyHeight;
  const columnY = item.y + bodyH;
  const columnH = item.h - bodyH;
  const flashing = item.hitFlash > 0;
  // The whole assembly flashes on a hit, not just the body — shots land on the
  // column far more often than on the emitter, and feedback has to appear where
  // the player is looking or it reads as the shot doing nothing.

  // Shield column: bright enough to read as lethal at a glance, but pulsing and
  // translucent so it still reads as a projected field that dies with the
  // emitter — not as solid terrain you might be able to stand on.
  const pulse = 0.5 + Math.sin(time * 9) * 0.12;
  ctx.fillStyle = alpha(PALETTE.droneShield, pulse * 0.35);
  ctx.fillRect(x + 1, columnY, item.w - 2, columnH);
  ctx.fillStyle = alpha(tint, pulse);
  ctx.fillRect(x + 4, columnY, item.w - 8, columnH);

  // Hard bright rails down each edge give the column a definite silhouette, so
  // the player can judge its width without staring at it.
  ctx.fillStyle = flashing ? PALETTE.playerCore : PALETTE.droneShield;
  ctx.fillRect(x + 3, columnY, 2, columnH);
  ctx.fillRect(x + item.w - 5, columnY, 2, columnH);

  // Energy crawling down the column toward the ground.
  ctx.fillStyle = alpha(PALETTE.playerCore, 0.6);
  for (let i = 0; i < 3; i++) {
    const offset = (time * 70 + i * (columnH / 3)) % columnH;
    ctx.fillRect(x + 4, columnY + offset, item.w - 8, 2);
  }

  glowRect(ctx, x, item.y, item.w, bodyH, flashing ? PALETTE.playerCore : tint);

  // Armour plates: one per remaining hit, stacked up the body.
  //
  // Colour alone would require learning a legend, and at speed nobody does. The
  // plates make the shot count literally countable, and watching them break off
  // one by one is also the clearest possible feedback that shots are landing.
  ctx.fillStyle = PALETTE.skyTop;
  ctx.fillRect(x + 3, item.y + 4, item.w - 6, bodyH - 8);

  const plates = item.maxHp;
  const plateH = (bodyH - 10) / plates;
  for (let i = 0; i < plates; i++) {
    const remaining = i < item.hp;
    // Stack from the bottom up, so the pile visibly shrinks as you shoot.
    const py = item.y + bodyH - 5 - (i + 1) * plateH + 1;
    if (remaining) {
      ctx.fillStyle = flashing ? PALETTE.playerCore : tint;
      ctx.fillRect(x + 5, py, item.w - 10, Math.max(1, plateH - 1));
    } else {
      ctx.fillStyle = alpha(tint, 0.18);
      ctx.fillRect(x + 5, py, item.w - 10, Math.max(1, plateH - 1));
    }
  }
}

/** Small fast drone that only exists while you're flying. */
function drawSkyDrone(ctx: CanvasRenderingContext2D, x: number, item: Obstacle, time: number): void {
  const flashing = item.hitFlash > 0;
  glowRect(ctx, x, item.y, item.w, item.h, flashing ? PALETTE.playerCore : PALETTE.drone);
  ctx.fillStyle = PALETTE.skyTop;
  ctx.fillRect(x + 3, item.y + 5, item.w - 6, 6);
  ctx.fillStyle = flashing ? PALETTE.playerCore : PALETTE.shot;
  ctx.fillRect(x + 4, item.y + 6, item.w - 8, 4);
  // Rotor blur above, so it reads as airborne rather than as a floating block.
  ctx.fillStyle = alpha(PALETTE.droneShield, 0.35 + Math.sin(time * 30) * 0.2);
  ctx.fillRect(x - 3, item.y - 3, item.w + 6, 2);
}

/**
 * Pickups. Bobbing, haloed, and colour-coded by whether they help you: the
 * risky one is drawn in hazard pink so the decision is legible at speed.
 */
function drawPickups(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  for (const item of state.pickups.items) {
    if (!item.active) continue;
    const def = POWERUP_DEFS[item.kind];
    const x = item.prevX + (item.x - item.prevX) * interpolation;
    const y = item.y + Math.sin(item.phase * 3) * POWERUP.bobAmplitude;
    const size = POWERUP.size;
    // Repair is drawn in the same cyan as the hearts in the HUD, so what it
    // does is obvious without ever being told.
    const colour = def.risky ? PALETTE.spike : def.instant ? PALETTE.player : PALETTE.shot;
    const pulse = 0.6 + Math.sin(item.phase * 6) * 0.25;

    ctx.fillStyle = alpha(colour, 0.16 * pulse);
    ctx.fillRect(x - 7, y - 7, size + 14, size + 14);
    ctx.fillStyle = alpha(colour, 0.34 * pulse);
    ctx.fillRect(x - 3, y - 3, size + 6, size + 6);

    // Diamond body, so pickups never read as one of the three hazards.
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = colour;
    ctx.fillRect(-size / 2.6, -size / 2.6, size / 1.3, size / 1.3);
    ctx.fillStyle = PALETTE.playerCore;
    ctx.fillRect(-size / 5, -size / 5, size / 2.5, size / 2.5);
    ctx.restore();

    drawText(ctx, POWERUP_GLYPH[item.kind], x + size / 2, y + size / 2 + 1, {
      size: 7,
      color: PALETTE.skyTop,
      align: 'center',
    });
  }
}

/** One character per powerup, readable at 7px. */
const POWERUP_GLYPH: Record<string, string> = {
  speed: '!',
  highJump: 'J',
  flight: 'F',
  invincible: 'I',
  power: 'P',
  longShot: 'L',
  repair: '+',
};

function drawDeath(ctx: CanvasRenderingContext2D, item: Obstacle, x: number): void {
  // deathTimer counts down from 0.18, so this goes 0 -> 1 over the animation.
  const t = 1 - item.deathTimer / 0.18;
  const spread = t * 18;
  const fade = 1 - t;
  ctx.fillStyle = alpha(PALETTE.shot, fade * 0.9);
  const cx = x + item.w / 2;
  const cy = item.y + OBSTACLE.drone.bodyHeight / 2;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    ctx.fillRect(
      cx + Math.cos(angle) * spread - 2,
      cy + Math.sin(angle) * spread - 2,
      4 * fade + 1,
      4 * fade + 1,
    );
  }
  ctx.strokeStyle = alpha(PALETTE.drone, fade * 0.6);
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - spread, cy - spread, spread * 2, spread * 2);
}

/**
 * The boss. Its silhouette has to say which phase it's in from across the
 * screen, because the phase is the entire fight: shuttered core means survive,
 * open core means punish.
 */
function drawBoss(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  const boss = state.boss;
  if (!boss.active) return;

  boss.bounds(scratch, interpolation);
  const { x, y, w, h } = scratch;
  const dying = boss.phase === 'dying';
  const flashing = boss.hitFlash > 0;

  if (dying) {
    // Comes apart in expanding rings rather than simply vanishing.
    const t = 1 - Math.max(0, boss.hitFlash);
    for (let i = 0; i < 7; i++) {
      const spread = 10 + i * 9 + Math.sin(state.elapsed * 20 + i) * 4;
      ctx.fillStyle = alpha(i % 2 ? PALETTE.shot : PALETTE.drone, Math.max(0, 0.5 - i * 0.06));
      ctx.fillRect(x + w / 2 - spread, y + h / 2 - spread, spread * 2, spread * 2);
    }
    ctx.fillStyle = alpha(PALETTE.playerCore, 0.7);
    ctx.fillRect(x + w / 4, y + h / 4, w / 2, h / 2);
    void t;
    return;
  }

  const shell = flashing ? PALETTE.playerCore : PALETTE.drone;

  // Engine wash behind it, stronger while it's closing in on you.
  const thrust = boss.phase === 'closing' || boss.phase === 'retreating' ? 22 : 12;
  ctx.fillStyle = alpha(PALETTE.shot, 0.18);
  ctx.fillRect(x + w, y + h * 0.3, thrust, h * 0.4);

  glowRect(ctx, x, y, w, h, shell);

  // Angled shoulders, so it reads as a machine rather than a box.
  ctx.fillStyle = PALETTE.skyTop;
  ctx.fillRect(x + w - 6, y, 6, 8);
  ctx.fillRect(x + w - 6, y + h - 8, 6, 8);
  ctx.fillRect(x, y, 5, 6);
  ctx.fillRect(x, y + h - 6, 5, 6);

  // The core. Shuttered and dark most of the time; wide open and pulsing
  // during the vulnerable window, which is the only cue that matters.
  const coreX = x + 10;
  const coreY = y + h / 2 - 9;
  if (boss.vulnerable) {
    const pulse = 0.7 + Math.sin(state.elapsed * 16) * 0.3;
    ctx.fillStyle = alpha(PALETTE.shot, 0.35 * pulse);
    ctx.fillRect(coreX - 6, coreY - 6, 30, 30);
    ctx.fillStyle = alpha(PALETTE.shot, pulse);
    ctx.fillRect(coreX, coreY, 18, 18);
    ctx.fillStyle = PALETTE.playerCore;
    ctx.fillRect(coreX + 5, coreY + 5, 8, 8);
  } else {
    ctx.fillStyle = PALETTE.skyBottom;
    ctx.fillRect(coreX, coreY, 18, 18);
    // Closed shutters.
    ctx.fillStyle = alpha(PALETTE.drone, 0.8);
    for (let i = 0; i < 3; i++) ctx.fillRect(coreX, coreY + i * 7, 18, 4);
  }

  // Telegraph: the whole shell flares just before an attack run launches.
  if (boss.phase === 'attacking') {
    ctx.strokeStyle = alpha(PALETTE.spike, 0.5 + Math.sin(state.elapsed * 12) * 0.3);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
  }
}

/** Exported for the screens layer, which dims the world behind its overlays. */
export function dimWorld(ctx: CanvasRenderingContext2D, amount: number): void {
  ctx.fillStyle = alpha(PALETTE.skyTop, amount);
  ctx.fillRect(0, 0, SCREEN.w, VIRTUAL_H);
}

export { GROUND_Y };
