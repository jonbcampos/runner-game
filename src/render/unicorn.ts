import { GROUND_Y, OBSTACLE, POWERUP, SCREEN, SHOT, VIRTUAL_H } from '../game/config';
import type { Aabb } from '../game/collision';
import type { Obstacle } from '../game/obstacles';
import { POWERUP_DEFS } from '../game/powerups';
import type { GameState } from '../game/state';
import { PALETTE, UNICORN_PALETTE, alpha } from './palette';
import type { Theme } from './theme';

/**
 * Ellie's Rainbow Run — the daylight theme.
 *
 * Every hazard keeps its exact hitbox and its exact answer; only the story
 * changes. A ground spike becomes a little unicorn you hop over, an overhead
 * beam becomes a floating castle you duck under, a shielded drone becomes a
 * rain cloud you zap. That's the whole point of the theme boundary: the 66
 * guarantees in the harness are about geometry and timing, and none of them
 * care that the thing you're jumping now has a horn.
 *
 * The one hard rule when authoring a theme: **the three hazard families must
 * stay instantly distinguishable from one another.** Getting them confused
 * means answering with the wrong verb, which is the worst mistake this game can
 * cause. Hence small-purple-on-the-ground, tall-pink-overhead,
 * grey-cloud-with-a-rain-column — different colours, different silhouettes,
 * different parts of the screen.
 *
 * The corollary, learned the moment unicorns entered the hazard lane: nothing
 * in the *background* may look like a hazard either. There used to be a unicorn
 * galloping through the middle distance, and it had to go — "some unicorns are
 * scenery and some you must jump" is precisely the ambiguity the rule forbids.
 */

const scratch: Aabb = { x: 0, y: 0, w: 0, h: 0 };

// --- background -------------------------------------------------------------

function drawBackground(ctx: CanvasRenderingContext2D, distance: number, elapsed: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCREEN.w, VIRTUAL_H);

  drawRainbowArc(ctx, distance * 0.06);
  drawClouds(ctx, distance * 0.14, 34, 0.55);
  drawHills(ctx, distance * 0.3, PALETTE.midStructure, 46, 30);
  drawButterflies(ctx, distance, elapsed);
  drawHills(ctx, distance * 0.55, PALETTE.nearStructure, 62, 18);
  drawMeadow(ctx, distance);
}

/** A big arc across the sky. Purely scenery — the hazard rainbow is pink and low. */
function drawRainbowArc(ctx: CanvasRenderingContext2D, offset: number): void {
  const bands = ['#ff8fae', '#ffc46b', '#fff06a', '#8fe08f', '#7fc7ff', '#c79bff'];
  const cx = SCREEN.w * 0.62 - (offset % (SCREEN.w * 3));
  const cy = GROUND_Y + 40;
  const radius = 150;
  // Deliberately faint. The hazard rainbow is small, saturated and low; this
  // one must never be mistaken for something you have to duck under.
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 7;
  bands.forEach((colour, i) => {
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - i * 7, Math.PI, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  offset: number,
  spacing: number,
  opacity: number,
): void {
  ctx.fillStyle = alpha('#ffffff', opacity);
  const period = spacing * 3;
  const start = Math.floor(offset / period) * period;
  for (let i = 0; i * spacing < SCREEN.w + period * 2; i++) {
    const worldX = start + i * spacing * 2.2;
    const x = worldX - offset;
    if (x > SCREEN.w + 40 || x < -60) continue;
    const seed = Math.abs(Math.floor(worldX / spacing)) * 2246822519;
    const y = 18 + ((seed >>> 7) % 70);
    const w = 20 + ((seed >>> 3) % 22);
    puff(ctx, x, y, w);
  }
}

/** Three overlapping lozenges read as a cloud without any curves. */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const h = Math.max(6, w * 0.42);
  ctx.fillRect(x, y + h * 0.35, w, h * 0.65);
  ctx.fillRect(x + w * 0.18, y, w * 0.4, h * 0.8);
  ctx.fillRect(x + w * 0.52, y + h * 0.12, w * 0.34, h * 0.7);
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  offset: number,
  colour: string,
  spacing: number,
  maxHeight: number,
): void {
  ctx.fillStyle = colour;
  const start = Math.floor(offset / spacing) * spacing;
  for (let i = 0; i * spacing < SCREEN.w + spacing * 3; i++) {
    const worldX = start + i * spacing;
    const x = worldX - offset;
    if (x > SCREEN.w + spacing || x < -spacing * 2) continue;
    const seed = Math.abs(Math.floor(worldX / spacing)) * 2654435761;
    const h = ((seed >>> 5) % maxHeight) + 14;
    // Stepped mound rather than a rectangle, so hills read as rolling.
    const w = spacing + 16;
    ctx.fillRect(Math.round(x), Math.round(GROUND_Y - h * 0.55), w, h);
    ctx.fillRect(Math.round(x + w * 0.18), Math.round(GROUND_Y - h * 0.85), w * 0.64, h);
    ctx.fillRect(Math.round(x + w * 0.34), Math.round(GROUND_Y - h), w * 0.3, h);
  }
}

/**
 * Butterflies drifting through the middle distance.
 *
 * The background needs *something* moving at its own parallax rate or the world
 * reads as a painted backdrop. This used to be a galloping unicorn, which was
 * the nicest thing in the scene right up until unicorns became the hazard you
 * jump — at which point it was actively teaching the wrong lesson. Butterflies
 * are three pixels across, wrong shape for every hazard family, and partly
 * occluded by the near hills, so they can't be read as anything to answer.
 */
function drawButterflies(ctx: CanvasRenderingContext2D, distance: number, elapsed: number): void {
  const spacing = 118;
  const offset = distance * 0.42;
  const start = Math.floor(offset / spacing) * spacing;
  for (let i = 0; i < Math.ceil(SCREEN.w / spacing) + 2; i++) {
    const worldX = start + i * spacing;
    const x = worldX - offset;
    if (x < -20 || x > SCREEN.w + 20) continue;

    const seed = Math.abs(Math.floor(worldX / spacing)) * 2654435761;
    const y = GROUND_Y - 34 - ((seed >>> 4) % 40) + Math.sin(elapsed * 3 + i) * 5;
    const colours = ['#fff06a', '#ff8fae', '#c79bff', '#ffffff'];
    // Wings flap by alternating which side is extended.
    const flap = Math.floor(elapsed * 11 + i) % 2;

    ctx.fillStyle = alpha(colours[(seed >>> 9) % colours.length]!, 0.85);
    ctx.fillRect(Math.round(x), Math.round(y - flap), 2, 3);
    ctx.fillRect(Math.round(x) + 3, Math.round(y - 1 + flap), 2, 3);
    ctx.fillStyle = alpha('#5a4470', 0.7);
    ctx.fillRect(Math.round(x) + 2, Math.round(y), 1, 3);
  }
}

/** Ground plane: grass with a bright lip and scattered flowers. */
function drawMeadow(ctx: CanvasRenderingContext2D, distance: number): void {
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, GROUND_Y, SCREEN.w, VIRTUAL_H - GROUND_Y);

  ctx.fillStyle = alpha(PALETTE.groundLine, 0.85);
  ctx.fillRect(0, GROUND_Y, SCREEN.w, 3);

  // Flowers scroll with the ground so the speed still reads.
  const spacing = 26;
  const offset = ((distance % spacing) + spacing) % spacing;
  for (let i = -1; i * spacing < SCREEN.w + spacing; i++) {
    const x = i * spacing - offset;
    const seed = Math.abs(Math.floor((distance - offset) / spacing) + i) * 2246822519;
    const y = GROUND_Y + 8 + ((seed >>> 6) % (VIRTUAL_H - GROUND_Y - 14));
    const colours = ['#fff06a', '#ffffff', '#ff8fae', '#c79bff'];
    ctx.fillStyle = alpha(colours[(seed >>> 11) % colours.length]!, 0.75);
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    ctx.fillRect(Math.round(x) - 2, Math.round(y) + 2, 2, 2);
    ctx.fillRect(Math.round(x) + 2, Math.round(y) + 2, 2, 2);
  }
}

// --- entities ---------------------------------------------------------------

/**
 * Ellie.
 *
 * A stylised 16x24 figure, not a portrait: pink dress with white trim, long
 * light hair that streams behind her when she runs. At this size a character is
 * a dozen coloured rectangles, and legibility of the *pose* — running, jumping,
 * sliding — matters far more than any detail, because the pose is gameplay
 * information.
 */
function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  const player = state.player;
  if (!player.dead && player.invulnerable && Math.floor(state.elapsed * 20) % 2 === 0) return;

  player.bounds(scratch, interpolation);
  const { x, y, w, h } = scratch;

  const dress = PALETTE.player;
  const trim = PALETTE.playerCore;
  const hair = '#a8763f';
  const skin = '#f0c39a';

  if (player.dead) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(state.elapsed * 6);
    ctx.fillStyle = dress;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }

  if (state.invincible) {
    const pulse = 0.5 + Math.sin(state.elapsed * 14) * 0.3;
    ctx.fillStyle = alpha('#fff06a', 0.3 * pulse);
    ctx.fillRect(x - 7, y - 7, w + 14, h + 14);
  }

  if (player.pose === 'slide') {
    // Sliding: tucked low, hair fanned out behind her.
    ctx.fillStyle = alpha(hair, 0.9);
    ctx.fillRect(x - 6, y + 2, 10, 7);
    ctx.fillStyle = dress;
    ctx.fillRect(x + 2, y + 2, w - 6, h - 3);
    ctx.fillStyle = trim;
    ctx.fillRect(x + 2, y + h - 3, w - 6, 2);
    ctx.fillStyle = skin;
    ctx.fillRect(x + w - 6, y + 1, 5, 5);
    ctx.fillStyle = hair;
    ctx.fillRect(x + w - 7, y, 6, 3);
    return;
  }

  const airborne = player.pose === 'air' || player.pose === 'fly';
  const step = Math.floor(state.distance / 9) % 2;

  // Hair first, so the body overlaps it. Streams further out when airborne.
  ctx.fillStyle = hair;
  ctx.fillRect(x - (airborne ? 6 : 4), y + 2, 7, 13);

  // Legs — a two-frame run, or tucked together in the air.
  ctx.fillStyle = skin;
  if (airborne) {
    ctx.fillRect(x + 4, y + h - 6, 4, 6);
    ctx.fillRect(x + 9, y + h - 5, 4, 5);
  } else {
    ctx.fillRect(x + 3 + step * 2, y + h - 6, 4, 6);
    ctx.fillRect(x + 9 - step * 2, y + h - 6, 4, 6);
  }

  // Dress: a trapezoid, widest at the hem, with white trim like the real one.
  ctx.fillStyle = dress;
  ctx.fillRect(x + 4, y + 9, 9, 6);
  ctx.fillRect(x + 2, y + 14, 13, 5);
  ctx.fillStyle = trim;
  ctx.fillRect(x + 2, y + 18, 13, 2);
  ctx.fillRect(x + 5, y + 9, 2, 5);

  // Head and hair.
  ctx.fillStyle = skin;
  ctx.fillRect(x + 5, y + 2, 8, 8);
  ctx.fillStyle = hair;
  ctx.fillRect(x + 4, y, 10, 4);
  ctx.fillRect(x + 4, y + 3, 3, 6);
  ctx.fillStyle = '#3a2b22';
  ctx.fillRect(x + 10, y + 5, 2, 2);
}

/** Sparkle bolts rather than laser bolts. */
function drawShots(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  for (const shot of state.shots.shots) {
    if (!shot.active) continue;
    const x = shot.prevX + (shot.x - shot.prevX) * interpolation;
    const y = shot.y;

    ctx.fillStyle = alpha(PALETTE.shot, 0.3);
    ctx.fillRect(x - 9, y, 9, SHOT.height);
    // Four-point sparkle: a cross with a bright centre.
    ctx.fillStyle = PALETTE.shot;
    ctx.fillRect(x, y - 2, SHOT.width, SHOT.height + 4);
    ctx.fillRect(x - 2, y, SHOT.width + 4, SHOT.height);
    ctx.fillStyle = PALETTE.shotCore;
    ctx.fillRect(x + 2, y, SHOT.width - 4, SHOT.height);
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
      drawPuffAway(ctx, item, x);
      continue;
    }
    switch (item.kind) {
      case 'spike':
        drawLittleUnicorn(ctx, x, item, state.distance);
        break;
      case 'beam':
        drawCastle(ctx, x, item, state.elapsed);
        break;
      case 'drone':
        drawRainCloud(ctx, x, item, state.elapsed);
        break;
      case 'skydrone':
        drawSkyCloud(ctx, x, item, state.elapsed);
        break;
    }
  }
}

/**
 * JUMP. A little unicorn standing in the lane — Ellie's own suggestion.
 *
 * Only 20x22, which is roughly a third of Ellie's height, and that smallness is
 * doing real work: it's the visual promise that a plain hop clears it. It faces
 * left, toward the player, because a creature turned to meet you reads as
 * something to deal with, and it fixes the direction of the horn — the one
 * silhouette detail that survives at speed.
 */
function drawLittleUnicorn(
  ctx: CanvasRenderingContext2D,
  x: number,
  item: Obstacle,
  distance: number,
): void {
  const y = item.y;
  const body = '#fdf6ff';
  const mane = PALETTE.spike;

  // Tail first, so the body edge stays clean.
  ctx.fillStyle = mane;
  ctx.fillRect(x + item.w - 4, y + 8, 4, 9);

  ctx.fillStyle = body;
  ctx.fillRect(x + 3, y + 9, item.w - 6, 8); // barrel
  ctx.fillRect(x + 1, y + 3, 8, 7); // head
  ctx.fillRect(x + 6, y + 7, 5, 4); // neck

  // Legs, trotting in place — tied to distance so they can't drift off-tempo.
  const step = Math.floor(distance / 8) % 2;
  ctx.fillRect(x + 4, y + 16, 3, 6 - step * 2);
  ctx.fillRect(x + 9, y + 16, 3, 4 + step * 2);
  ctx.fillRect(x + 14, y + 16, 3, 6 - step * 2);

  // Mane down the neck, and the horn: gold, and the only pointed thing here.
  ctx.fillStyle = mane;
  ctx.fillRect(x + 7, y + 2, 4, 9);
  ctx.fillStyle = '#fff06a';
  ctx.fillRect(x + 3, y - 3, 3, 6);

  ctx.fillStyle = '#5a4470';
  ctx.fillRect(x + 2, y + 5, 2, 2); // eye
}

/**
 * SLIDE. A castle floating over the lane — the gap beneath it is the
 * instruction, and Ellie asked for buildings.
 *
 * It floats rather than standing on legs, and that's not whimsy: the hitbox is
 * a single rectangle hanging 16px above the ground, so any pillar drawn down to
 * the grass would be a lie — you'd slide straight through it. A castle on a
 * cloud is the shape that tells the truth about the hitbox, and in this world
 * it needs no explanation.
 */
function drawCastle(
  ctx: CanvasRenderingContext2D,
  x: number,
  item: Obstacle,
  time: number,
): void {
  const w = item.w;
  const y = item.y;
  const bottom = y + item.h;
  const wall = PALETTE.beam;

  // Roof: a stepped spire. Blue, not purple — purple is the unicorn's colour in
  // this theme and no other hazard gets to borrow it.
  ctx.fillStyle = '#4a6fd0';
  ctx.fillRect(x + w / 2 - 3, y + 2, 6, 6);
  ctx.fillRect(x + w / 2 - 7, y + 6, 14, 5);
  ctx.fillRect(x + 3, y + 10, w - 6, 6);

  // Pennant on top, flapping.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + w / 2 - 1, y - 6, 1, 8);
  ctx.fillStyle = '#fff06a';
  ctx.fillRect(x + w / 2, y - 6 + (Math.floor(time * 8) % 2), 6, 4);

  // Walls, with battlements just under the roof.
  ctx.fillStyle = wall;
  ctx.fillRect(x + 2, y + 16, w - 4, item.h - 24);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 3 + i * 8, y + 13, 5, 4);
  }

  // Arched windows, lit — three of them, so it reads as lived-in.
  ctx.fillStyle = '#fff06a';
  ctx.fillRect(x + 7, y + 24, 5, 8);
  ctx.fillRect(x + w - 12, y + 24, 5, 8);
  ctx.fillRect(x + w / 2 - 3, y + 38, 6, 9);
  ctx.fillStyle = alpha('#ffffff', 0.6);
  ctx.fillRect(x + 7, y + 24, 5, 2);
  ctx.fillRect(x + w - 12, y + 24, 5, 2);

  // The cloud it rests on, which is also the bright underside cue: exactly
  // where the danger stops and the slide gap begins.
  //
  // Drawn with explicit rects strictly inside the hitbox rather than with
  // puff(), which centres a lozenge and would hang ~9px below the bottom edge.
  // The slide gap is only 16px, so that overhang covered half of it: the player
  // would be squeezing through a space that looks solid, and a clean slide
  // would read as a lucky escape. Sprites may be smaller than their hitbox —
  // never larger.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, bottom - 13, w, 7);
  ctx.fillRect(x + 3, bottom - 7, w - 6, 5);
  ctx.fillRect(x + w - 9, bottom - 8, 7, 4);
  ctx.fillRect(x, bottom - 2, w, 2);
}

/** SHOOT. Rain cloud with a downpour column — armour plates are hailstones. */
function drawRainCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  item: Obstacle,
  time: number,
): void {
  const tint = PALETTE.droneTier[item.maxHp] ?? PALETTE.drone;
  const bodyH = OBSTACLE.drone.bodyHeight;
  const columnY = item.y + bodyH;
  const columnH = item.h - bodyH;
  const flashing = item.hitFlash > 0;

  // The rain column IS the hitbox, so it has to read as solidly as the cloud
  // does. A pale drizzle over a bright sky is invisible at speed — which makes
  // the most important part of the hazard the least visible part of it.
  ctx.fillStyle = alpha('#4a5570', 0.34);
  ctx.fillRect(x + 2, columnY, item.w - 4, columnH);
  ctx.fillStyle = alpha(tint, 0.75);
  ctx.fillRect(x + 4, columnY, item.w - 8, columnH);

  // Hard rails down both edges, so the column has a definite silhouette.
  ctx.fillStyle = alpha('#3f475e', 0.9);
  ctx.fillRect(x + 3, columnY, 2, columnH);
  ctx.fillRect(x + item.w - 5, columnY, 2, columnH);

  ctx.fillStyle = alpha('#ffffff', 0.95);
  for (let i = 0; i < 9; i++) {
    const dropX = x + 5 + ((i * 4) % (item.w - 10));
    const dropY = columnY + ((time * 170 + i * 19) % columnH);
    ctx.fillRect(dropX, dropY, 2, 6);
  }

  ctx.fillStyle = flashing ? '#ffffff' : tint;
  puff(ctx, x - 2, item.y, item.w + 4);

  // Hailstones: one per remaining hit, same countable idea as the neon plates.
  const plates = item.maxHp;
  const plateH = (bodyH - 10) / plates;
  for (let i = 0; i < plates; i++) {
    const py = item.y + bodyH - 5 - (i + 1) * plateH + 1;
    ctx.fillStyle = i < item.hp ? (flashing ? '#ffffff' : '#e8f2ff') : alpha('#ffffff', 0.2);
    ctx.fillRect(x + 6, py, item.w - 12, Math.max(1, plateH - 1));
  }
}

function drawSkyCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  item: Obstacle,
  time: number,
): void {
  const flashing = item.hitFlash > 0;
  ctx.fillStyle = flashing ? '#ffffff' : PALETTE.drone;
  puff(ctx, x, item.y, item.w);
  ctx.fillStyle = alpha('#bfe4ff', 0.8);
  ctx.fillRect(x + 4, item.y + item.h - 2, 1, 4 + Math.sin(time * 12) * 2);
  ctx.fillRect(x + item.w - 7, item.y + item.h - 2, 1, 4 + Math.cos(time * 12) * 2);
}

/** Destroyed clouds puff apart instead of exploding. */
function drawPuffAway(ctx: CanvasRenderingContext2D, item: Obstacle, x: number): void {
  const t = 1 - item.deathTimer / 0.18;
  const fade = 1 - t;
  const spread = t * 16;
  ctx.fillStyle = alpha('#ffffff', fade * 0.85);
  const cx = x + item.w / 2;
  const cy = item.y + OBSTACLE.drone.bodyHeight / 2;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const size = 5 * fade + 2;
    ctx.fillRect(cx + Math.cos(angle) * spread - size / 2, cy + Math.sin(angle) * spread - size / 2, size, size);
  }
}

/** Pickups as glowing hearts-in-diamonds; risky ones are thundercloud grey. */
function drawPickups(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  for (const item of state.pickups.items) {
    if (!item.active) continue;
    const def = POWERUP_DEFS[item.kind];
    const x = item.prevX + (item.x - item.prevX) * interpolation;
    const y = item.y + Math.sin(item.phase * 3) * POWERUP.bobAmplitude;
    const size = POWERUP.size;
    const colour = def.risky ? '#6d7690' : def.instant ? PALETTE.player : '#fff06a';
    const pulse = 0.6 + Math.sin(item.phase * 6) * 0.25;

    ctx.fillStyle = alpha('#ffffff', 0.3 * pulse);
    ctx.fillRect(x - 5, y - 5, size + 10, size + 10);

    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = colour;
    ctx.fillRect(-size / 2.6, -size / 2.6, size / 1.3, size / 1.3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-size / 5, -size / 5, size / 2.5, size / 2.5);
    ctx.restore();
  }
}

/**
 * The boss: a big grumpy storm cloud.
 *
 * Same two-phase read as the neon version, because that read *is* the fight:
 * shuttered means survive, open means punish. Here the opening is a glowing
 * rainbow heart in the middle of the cloud.
 */
function drawBoss(ctx: CanvasRenderingContext2D, state: GameState, interpolation: number): void {
  const boss = state.boss;
  if (!boss.active) return;

  boss.bounds(scratch, interpolation);
  const { x, y, w, h } = scratch;
  const flashing = boss.hitFlash > 0;

  if (boss.phase === 'dying') {
    for (let i = 0; i < 7; i++) {
      const spread = 10 + i * 9 + Math.sin(state.elapsed * 20 + i) * 4;
      ctx.fillStyle = alpha(i % 2 ? '#fff06a' : '#ffffff', Math.max(0, 0.5 - i * 0.06));
      ctx.fillRect(x + w / 2 - spread, y + h / 2 - spread, spread * 2, spread * 2);
    }
    return;
  }

  ctx.fillStyle = flashing ? '#ffffff' : '#5a6480';
  puff(ctx, x, y, w);
  ctx.fillStyle = alpha('#3f475e', 0.9);
  puff(ctx, x + 4, y + h * 0.45, w - 8);

  // Grumpy eyes — angled brows, which read as "hostile" at any size.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 12, y + 16, 7, 5);
  ctx.fillRect(x + w - 20, y + 16, 7, 5);
  ctx.fillStyle = '#2a3040';
  ctx.fillRect(x + 14, y + 17, 3, 3);
  ctx.fillRect(x + w - 18, y + 17, 3, 3);
  ctx.fillRect(x + 11, y + 13, 9, 2);
  ctx.fillRect(x + w - 21, y + 13, 9, 2);

  const coreX = x + w / 2 - 9;
  const coreY = y + h / 2 - 2;
  if (boss.vulnerable) {
    const pulse = 0.7 + Math.sin(state.elapsed * 16) * 0.3;
    const bands = ['#ff4f9c', '#fff06a', '#7fc7ff'];
    bands.forEach((colour, i) => {
      ctx.fillStyle = alpha(colour, pulse);
      ctx.fillRect(coreX - i * 2, coreY - i * 2 + i * 4, 18 + i * 4, 6);
    });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(coreX + 5, coreY + 4, 8, 5);
  } else {
    // Lightning instead of an open core: clearly charged, clearly closed.
    ctx.fillStyle = alpha('#fff06a', 0.85);
    ctx.fillRect(coreX + 8, coreY, 3, 7);
    ctx.fillRect(coreX + 5, coreY + 7, 6, 3);
    ctx.fillRect(coreX + 7, coreY + 10, 3, 6);
  }
}

export const unicornTheme: Theme = {
  id: 'unicorn',
  label: 'RAINBOW',
  palette: UNICORN_PALETTE,
  background: (ctx, state) => drawBackground(ctx, state.distance, state.elapsed),
  boss: drawBoss,
  obstacles: drawObstacles,
  pickups: drawPickups,
  shots: drawShots,
  player: drawPlayer,
};
