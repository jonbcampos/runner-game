import { BOSS, GROUND_Y, OBSTACLE, PLAYER_X, SCREEN, VIRTUAL_H } from '../game/config';
import type { Aabb } from '../game/collision';
import type { Obstacle } from '../game/obstacles';
import type { PowerupKind } from '../game/powerups';
import type { GameState } from '../game/state';
import { cleanSky, type CleanSky } from './backdrop';
import { environment } from './environment';
import { juice } from './juice';
import { alpha } from './palette';
import { frameBounds, sprite, spriteFrames } from './sprites';

/**
 * The painted layer of the RAINBOW theme (ART-PLAN.md).
 *
 * Every function here returns false when its art isn't loaded, and the caller
 * in unicorn.ts then draws the procedural version it always drew. That is the
 * whole contract: art sits on top and never replaces anything, and deleting
 * `public/sprites/` gives back the game exactly as it shipped.
 *
 * Two rules from decision 37 shape every hazard below:
 *  - **A sprite may be smaller than its hitbox, never larger.** Hazards are
 *    fitted INSIDE their boxes by their measured content, bottom-aligned.
 *  - **Game state stays procedural, on top.** The rain column (it IS the
 *    hitbox), the armour plates (they must be countable), the boss's core
 *    (shut versus open IS the fight) and the pickups' glow are all drawn by
 *    code over the paintings.
 */

const SMOOTH = (ctx: CanvasRenderingContext2D, on: boolean): boolean => {
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = on;
  return was;
};

/**
 * Draw a frame so its CONTENT's bottom-centre lands on (cx, bottom), at `scale`
 * source pixels per virtual pixel. `flip` mirrors about the content's centre.
 */
function drawAnchored(
  ctx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  cx: number,
  bottom: number,
  scale: number,
  sx = 1,
  sy = 1,
): void {
  const b = frameBounds(frame);
  const was = SMOOTH(ctx, true);
  ctx.save();
  ctx.translate(cx, bottom);
  ctx.scale(scale * sx, scale * sy);
  ctx.drawImage(frame, -(b.x + b.w / 2), -(b.y + b.h));
  ctx.restore();
  ctx.imageSmoothingEnabled = was;
}

/** Fit a frame's content INSIDE a box, centred across and sitting on its bottom. Returns the scale. */
function drawInside(
  ctx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const b = frameBounds(frame);
  const scale = Math.min(w / b.w, h / b.h);
  drawAnchored(ctx, frame, x + w / 2, y + h, scale);
  return scale;
}

// --- Tints ------------------------------------------------------------------------

const tints = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

/**
 * A multiply-tinted copy, made once per (image, colour) and cached. Night is
 * the painted hills multiplied by indigo; armour tiers are the painted cloud
 * multiplied by their tier grey.
 */
function tinted(image: HTMLCanvasElement, tint: string): HTMLCanvasElement {
  if (tint === '#ffffff') return image;
  let byTint = tints.get(image);
  if (!byTint) {
    byTint = new Map();
    tints.set(image, byTint);
  }
  const hit = byTint.get(tint);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const c = canvas.getContext('2d');
  if (!c) return image;
  c.drawImage(image, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = tint;
  c.fillRect(0, 0, canvas.width, canvas.height);
  // Multiply paints the transparent parts too; put the original alpha back.
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(image, 0, 0);
  byTint.set(tint, canvas);
  return canvas;
}

function mixWithWhite(hex: string, amount: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((v >> shift) & 255) * (1 - amount) + 255 * amount);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// --- World preparation (one-off, at load) ------------------------------------------

/**
 * Heavy one-off work, done one piece per frame so it never stalls a run:
 * lifting the clouds out of each sky, cropping the parallax strips to their
 * content, and cutting the white sky off the top of the ground strip.
 */
const prepared = new Map<string, HTMLCanvasElement | CleanSky | null>();
const PREP = ['sky.day', 'sky.dusk', 'sky.night', 'hills', 'trees', 'ground'] as const;

export function prepareArt(): void {
  for (const id of PREP) {
    if (prepared.has(id)) continue;
    const image = sprite(id);
    if (!image) continue;
    if (id.startsWith('sky.')) prepared.set(id, cleanSky(image));
    else if (id === 'ground') prepared.set(id, clearGroundSky(image));
    else prepared.set(id, cropToContent(image));
    return; // One per frame.
  }
}

/**
 * The strips were painted as one long run of hills with a cut at each end, a
 * little way in from the picture's edge. Cropped to their content, every
 * other copy mirrored, the cut ends meet their own reflection: a seamless band.
 */
function cropToContent(image: HTMLCanvasElement): HTMLCanvasElement {
  const b = frameBounds(image);
  const inset = 3;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, b.w - inset * 2);
  canvas.height = image.height;
  canvas.getContext('2d')?.drawImage(image, -(b.x + inset), 0);
  return canvas;
}

/**
 * The ground came back with plain white sky between the grass blades. Each
 * column is cleared from the top down until it meets something that isn't
 * near-white, so the blades poke up over the hills instead of over a white band.
 */
function clearGroundSky(image: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) return image;
  c.drawImage(image, 0, 0);
  const data = c.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  const limit = Math.floor(canvas.height * 0.35);
  for (let x = 0; x < canvas.width; x++) {
    for (let y = 0; y < limit; y++) {
      const i = (y * canvas.width + x) * 4;
      const lo = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
      if (lo < 215) {
        // Feather the first pixel of the blade, so the edge isn't jagged.
        if (y > 0) d[i + 3] = 200;
        break;
      }
      d[i + 3] = 0;
    }
  }
  c.putImageData(data, 0, 0);
  // Where the grass actually starts (the solid band), for placing the strip.
  groundTop = findSolidRow(d, canvas.width, canvas.height);
  return canvas;
}

/** First row (as a fraction of the height) where at least 95% of pixels are opaque. */
let groundTop = 0.15;
function findSolidRow(d: Uint8ClampedArray, w: number, h: number): number {
  for (let y = 0; y < h * 0.5; y++) {
    let solid = 0;
    for (let x = 0; x < w; x += 3) if (d[(y * w + x) * 4 + 3]! > 128) solid++;
    if (solid / Math.ceil(w / 3) > 0.95) return y / h;
  }
  return 0.15;
}

function preparedCanvas(id: string): HTMLCanvasElement | null {
  const p = prepared.get(id);
  return p instanceof HTMLCanvasElement ? p : null;
}

// --- The world -------------------------------------------------------------------

/** Weight of a painted sky in the current blend: 0..1. */
export function skyWeight(id: string): number {
  const env = environment();
  let w = 0;
  if (env.skyFrom === id) w += 1 - env.artT;
  if (env.skyTo === id) w += env.artT;
  return w;
}

/**
 * The painted sky, crossfaded with the cycle, and the clouds lifted out of it
 * drifting on their own. The sky is static: far mountains don't visibly move,
 * and a scrolling sky would repeat its painted sun.
 */
export function drawSkyArt(ctx: CanvasRenderingContext2D, distance: number): boolean {
  const env = environment();
  const from = prepared.get(env.skyFrom) as CleanSky | null | undefined;
  if (!from) return false;
  drawOneSky(ctx, from, 1, distance);
  if (env.artT > 0 && env.skyTo !== env.skyFrom) {
    const to = prepared.get(env.skyTo) as CleanSky | null | undefined;
    if (to) drawOneSky(ctx, to, env.artT, distance);
  }
  return true;
}

function drawOneSky(ctx: CanvasRenderingContext2D, sky: CleanSky, opacity: number, distance: number): void {
  const image = sky.clean;
  const bottom = GROUND_Y + 12;
  const scale = Math.max(SCREEN.w / image.width, bottom / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = (SCREEN.w - dw) / 2;
  const dy = bottom - dh;
  const was = SMOOTH(ctx, true);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(image, dx, dy, dw, dh);
  if (bottom < VIRTUAL_H) {
    // Under the ground strip, in case the strip hasn't loaded.
    ctx.drawImage(image, 0, image.height - 2, image.width, 2, dx, bottom, dw, VIRTUAL_H - bottom);
  }

  // Clouds: each painted cloud drifts left, wraps, and has a smaller, fainter,
  // slower twin behind it for depth (slingshot's decision 16).
  const span = SCREEN.w + 160;
  sky.clouds.forEach((cloud, i) => {
    const w = cloud.image.width * scale;
    const h = cloud.image.height * scale;
    const speed = 3 + (i % 3) * 1.5;
    for (const layer of [0.55, 1]) {
      const drift = (juice.time * speed + distance * 0.025) * layer;
      const base = dx + cloud.x * scale + (layer < 1 ? span * 0.5 : 0);
      const x = (((base - drift + 80) % span) + span) % span - 80;
      ctx.globalAlpha = opacity * (layer < 1 ? 0.45 : 1);
      const k = layer < 1 ? 0.6 : 1;
      ctx.drawImage(cloud.image, x, dy + cloud.y * scale + (layer < 1 ? -6 : 0), w * k, h * k);
    }
  });
  ctx.restore();
  ctx.imageSmoothingEnabled = was;
}

/**
 * A painted strip tiled across the frame, every other copy mirrored, at a
 * parallax `offset`, tinted for the time of day. `height` is how tall the
 * strip's content stands above `base`.
 */
function drawStrip(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  offset: number,
  base: number,
  height: number,
  topFraction: number,
): void {
  const env = environment();
  const contentH = image.height * (1 - topFraction);
  const scale = height / contentH;
  const w = image.width * scale;
  const h = image.height * scale;
  const y = base - h;
  const was = SMOOTH(ctx, true);
  const pass = (tint: string, opacity: number) => {
    const img = tinted(image, tint);
    ctx.globalAlpha = opacity;
    const first = Math.floor(offset / w);
    for (let i = first; ; i++) {
      const x = i * w - offset;
      if (x > SCREEN.w) break;
      if ((i & 1) === 1) {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -0.5, 0, w + 1, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, x - 0.5, y, w + 1, h);
      }
    }
  };
  ctx.save();
  pass(env.tintFrom, 1);
  if (env.artT > 0 && env.tintTo !== env.tintFrom) pass(env.tintTo, env.artT);
  ctx.restore();
  ctx.imageSmoothingEnabled = was;
}

export function drawHillsArt(ctx: CanvasRenderingContext2D, distance: number): boolean {
  const image = preparedCanvas('hills');
  if (!image) return false;
  const b = frameBounds(image);
  drawStrip(ctx, image, distance * 0.25, GROUND_Y + 6, 62, b.y / image.height);
  return true;
}

export function drawTreesArt(ctx: CanvasRenderingContext2D, distance: number): boolean {
  const image = preparedCanvas('trees');
  if (!image) return false;
  const b = frameBounds(image);
  drawStrip(ctx, image, distance * 0.55, GROUND_Y + 4, 40, b.y / image.height);
  return true;
}

/** The ground, moving at the world's own speed. The blades poke up over the trees. */
export function drawGroundArt(ctx: CanvasRenderingContext2D, distance: number): boolean {
  const image = preparedCanvas('ground');
  if (!image) return false;
  // Grass solid band starts at GROUND_Y - 2, so the lane line is the grass line.
  const solid = groundTop;
  const height = VIRTUAL_H - GROUND_Y + 2;
  const scale = height / (image.height * (1 - solid));
  const top = GROUND_Y - 2 - image.height * solid * scale;
  drawStrip(ctx, image, distance, top + image.height * scale, image.height * scale, 0);
  return true;
}

// --- Ellie -------------------------------------------------------------------------

/** How tall the running Ellie is drawn, in virtual px, against her 24 px box. */
const ELLIE_HEIGHT = 27;

let ellieScale = 0;
function ellieRefScale(run: HTMLCanvasElement[]): number {
  if (ellieScale > 0) return ellieScale;
  const heights = run.map((f) => frameBounds(f).h).sort((a, b) => a - b);
  ellieScale = ELLIE_HEIGHT / heights[heights.length >> 1]!;
  return ellieScale;
}

/**
 * Ellie, picked from game state: run frames by distance (decision 22's rule,
 * so a faster world turns her legs over faster), rise/fall frames by vertical
 * speed, the slide fitted into the slide box, the sparkle-cast pose for a beat
 * after each shot, and "oops!" after a bump. Squash and stretch on top.
 */
export function drawEllieArt(ctx: CanvasRenderingContext2D, state: GameState, box: Aabb): boolean {
  const run = spriteFrames('ellie.run');
  const act = spriteFrames('ellie.act');
  const mood = spriteFrames('ellie.mood');
  if (!run || !act || !mood) return false;
  const player = state.player;
  const scale = ellieRefScale(run);
  const cx = box.x + box.w / 2;
  const feet = box.y + box.h;

  if (player.dead) {
    // Not hurt: a cartoon tumble, sitting down in the air, still smiling.
    const frame = mood[0]!;
    ctx.save();
    ctx.translate(cx, feet - 10);
    ctx.rotate(Math.sin(juice.time * 7) * 0.35);
    drawAnchored(ctx, frame, 0, 10, scale * 0.95);
    ctx.restore();
    return true;
  }

  if (player.pose === 'slide') {
    const frame = act[2]!;
    const b = frameBounds(frame);
    // Kept under 14 px tall: the castle's gap is 16, and a slide that LOOKS
    // like it touches the castle teaches that a safe slide was lucky.
    const s = Math.min(32 / b.w, 13.5 / b.h);
    const right = box.x + box.w + 3;
    groundShadow(ctx, box.x + box.w / 2, 26, 0);
    drawAnchored(ctx, frame, right - (b.w * s) / 2, feet + 0.5, s);
    return true;
  }

  let frame: HTMLCanvasElement;
  let sx = 1;
  let sy = 1;
  const airborne = player.pose === 'air' || player.pose === 'fly';
  if (juice.sinceHit < 0.4) {
    frame = mood[0]!;
  } else if (airborne) {
    frame = player.pose === 'fly' || player.vy < 40 ? act[0]! : act[1]!;
    // Stretch on take-off.
    if (juice.sinceJump < 0.16) {
      const k = 1 - juice.sinceJump / 0.16;
      sy = 1 + 0.16 * k;
      sx = 1 - 0.1 * k;
    }
  } else if (juice.sinceCheer < 1.6) {
    // The Storm King cheered up: she cheers too, with a little hop.
    frame = mood[1]!;
    sy = 1 + Math.abs(Math.sin(juice.sinceCheer * 9)) * 0.06;
  } else if (juice.sinceShot < 0.22) {
    frame = act[3]!;
  } else {
    frame = run[Math.floor(state.distance / 11) % run.length]!;
  }
  // Squash on landing, springing back.
  if (!airborne && juice.sinceLand < 0.14) {
    const k = Math.sin((juice.sinceLand / 0.14) * Math.PI);
    sy = 1 - 0.2 * k;
    sx = 1 + 0.14 * k;
  }

  groundShadow(ctx, cx, 16, GROUND_Y - feet);
  if (state.invincible) {
    const pulse = 0.5 + Math.sin(state.elapsed * 14) * 0.3;
    ctx.fillStyle = alpha('#fff06a', 0.3 * pulse);
    ctx.beginPath();
    ctx.arc(cx, feet - 13, 19, 0, Math.PI * 2);
    ctx.fill();
  }
  drawAnchored(ctx, frame, cx, feet + 0.5, scale, sx, sy);

  if (juice.sinceHit < 1) drawDizzyStars(ctx, cx, feet - 30, juice.sinceHit);
  return true;
}

/**
 * A soft shadow on the grass under something: what makes a sprite stand ON
 * the ground instead of floating in front of it. Shrinks and fades with height.
 */
export function groundShadow(ctx: CanvasRenderingContext2D, cx: number, width: number, height: number): void {
  const k = Math.max(0, 1 - height / 90);
  if (k <= 0) return;
  ctx.fillStyle = alpha('#2a3a20', 0.28 * k);
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y + 1, (width / 2) * (0.6 + 0.4 * k), 2.2 * k + 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Little stars circling her head after a bump. Nobody's hurt; it's a cartoon. */
function drawDizzyStars(ctx: CanvasRenderingContext2D, x: number, y: number, age: number): void {
  const fade = 1 - age;
  for (let i = 0; i < 3; i++) {
    const a = juice.time * 7 + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * 9;
    const sy = y + Math.sin(a) * 3;
    ctx.fillStyle = alpha('#fff06a', fade);
    ctx.fillRect(sx - 2, sy - 0.5, 4, 1.5);
    ctx.fillRect(sx - 0.5, sy - 2, 1.5, 4);
  }
}

// --- Hazards -----------------------------------------------------------------------

/**
 * Hazards she has gone past, so each only sparkles once. Keyed by the pooled
 * object; a reused slot has jumped back to the right edge, which un-marks it.
 */
const cleared = new WeakMap<Obstacle, boolean>();

/**
 * Notice a ground or overhead hazard passing behind her untouched, and
 * celebrate it: a sparkle burst and (via main.ts) a twinkle. Returns how far
 * behind her it is, or -1 if it's still ahead.
 */
export function trackCleared(item: Obstacle, x: number, state: GameState): number {
  if (x > PLAYER_X + 40) {
    cleared.delete(item);
    return -1;
  }
  const behind = PLAYER_X - (x + item.w);
  if (behind < 0) return -1;
  if (!cleared.has(item)) {
    // Bumped into it? Then it wasn't cleared, it was an oops.
    const ok = juice.sinceHit > 0.8 && state.phase === 'playing';
    cleared.set(item, ok);
    if (ok && (item.kind === 'spike' || item.kind === 'beam')) {
      const y = item.kind === 'spike' ? item.y - 4 : item.y + item.h - 6;
      juice.particles?.sparkle(x + item.w / 2, y, () => Math.random(), 8, 45);
      juice.onCleared?.(item.kind);
    }
  }
  return cleared.get(item) ? behind : -2;
}

/** JUMP: the trotting unicorn, facing her; happy once she's over it. */
export function drawUnicornArt(ctx: CanvasRenderingContext2D, x: number, item: Obstacle, state: GameState): boolean {
  const trot = spriteFrames('unicorn.trot');
  const happy = spriteFrames('unicorn.happy');
  if (!trot || !happy) return false;
  const behind = trackCleared(item, x, state);
  let frame: HTMLCanvasElement;
  if (behind === -2) frame = happy[2]!; // bumped: "oops!"
  else if (behind >= 0) frame = happy[behind < 26 ? 0 : behind < 70 ? 1 : 3]!;
  else frame = trot[Math.floor(state.distance / 8) % trot.length]!;
  groundShadow(ctx, x + item.w / 2, item.w, 0);
  drawInside(ctx, frame, x, item.y, item.w, item.h);
  return true;
}

/** SLIDE: the castle on its flat-bottomed cloud, fitted inside the box. */
export function drawCastleArt(ctx: CanvasRenderingContext2D, x: number, item: Obstacle, state: GameState): boolean {
  const castle = sprite('castle');
  if (!castle) return false;
  trackCleared(item, x, state);
  drawInside(ctx, castle, x, item.y, item.w, item.h);
  return true;
}

/**
 * SHOOT: the painted cloud on top of its procedural rain column. Tinted by
 * armour tier (lighter = fewer plates), bonked while flashing. Returns false
 * without art, and the caller draws the procedural puff and plates.
 */
export function drawCloudArt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tier: string | null,
  flashing: boolean,
  wobble: number,
): boolean {
  const grump = spriteFrames('cloud.grump');
  const moods = spriteFrames('cloud.happy');
  if (!grump || !moods) return false;
  // Row 2 of the sheet is [bonked, surprised, happy, giggling].
  const frame = flashing ? moods[0]! : grump[((Math.floor(wobble) % grump.length) + grump.length) % grump.length]!;
  const image = tier && !flashing ? tinted(frame, mixWithWhite(tier, 0.45)) : frame;
  drawInside(ctx, image, x, y, w, h);
  return true;
}

/**
 * Armour plates, drawn in the rain column just under the cloud: hailstones in
 * the rain, one per hit left. Here rather than over the painting so the face
 * stays visible and the count stays countable.
 */
export function drawHailPlates(ctx: CanvasRenderingContext2D, x: number, item: Obstacle, flashing: boolean): void {
  const top = item.y + OBSTACLE.drone.bodyHeight + 2;
  const plateH = 4;
  for (let i = 0; i < item.maxHp; i++) {
    const py = top + i * (plateH + 2);
    const live = i < item.hp;
    ctx.fillStyle = live ? alpha('#2a3048', 0.85) : alpha('#2a3048', 0.25);
    ctx.fillRect(x + 4, py - 1, item.w - 8, plateH + 2);
    ctx.fillStyle = live ? (flashing ? '#ffffff' : '#e8f4ff') : alpha('#ffffff', 0.25);
    ctx.fillRect(x + 5, py, item.w - 10, plateH);
    if (live) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 6, py, 3, 1);
    }
  }
}

// --- Boss -----------------------------------------------------------------------------

/**
 * The Storm King. Frames follow his phase; the core stays procedural on top:
 * a pulsing rainbow in his open mouth means "now!", crackling sparks at his
 * sides mean "not yet". Beaten, he cheers up, waves and floats off.
 */
export function drawBossArt(ctx: CanvasRenderingContext2D, state: GameState, box: Aabb): boolean {
  const fight = spriteFrames('boss.fight');
  const end = spriteFrames('boss.end');
  if (!fight || !end) return false;
  const boss = state.boss;
  const { x, y, w, h } = box;

  if (boss.phase === 'dying') {
    const t = Math.min(1, juice.sinceBossDie / BOSS.deathDuration);
    const frame = t < 0.25 ? end[1]! : end[2 + (Math.floor(juice.time * 3) % 2)]!;
    ctx.save();
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    drawInside(ctx, frame, x + t * 30, y - t * t * 70, w, h);
    ctx.restore();
    return true;
  }

  let frame: HTMLCanvasElement;
  if (boss.hitFlash > 0) frame = end[0]!;
  else if (boss.phase === 'vulnerable') frame = fight[3]!;
  else if (boss.phase === 'closing') frame = fight[2]!;
  else if (boss.phase === 'attacking') frame = fight[Math.floor(juice.time * 2.5) % 2]!;
  else frame = fight[0]!;

  // A slow bob so he never sits dead still; inside the box, never past it.
  const bob = Math.sin(juice.time * 3) * 1.5;
  const scale = drawInside(ctx, frame, x + 1, y + 2 + bob, w - 2, h - 3);
  void scale;

  if (boss.vulnerable) {
    const pulse = 0.6 + Math.sin(state.elapsed * 16) * 0.3;
    const cx = x + w / 2;
    const cy = y + h * 0.62;
    const bands = ['#ff4f9c', '#fff06a', '#7fc7ff'];
    bands.forEach((colour, i) => {
      ctx.strokeStyle = alpha(colour, pulse);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 9 + i * 3 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (boss.phase === 'attacking' || boss.phase === 'entering') {
    // Little lightning crackles at his sides: charged, and closed.
    if (Math.floor(juice.time * 12) % 3 !== 0) {
      ctx.fillStyle = alpha('#fff06a', 0.9);
      for (const side of [-1, 1]) {
        const bx = x + w / 2 + side * (w / 2 + 2);
        const by = y + h * 0.55;
        ctx.fillRect(bx - 1, by - 5, 2, 5);
        ctx.fillRect(bx - 1 - side * 2, by, 3, 2);
        ctx.fillRect(bx - side * 2, by + 2, 2, 5);
      }
    }
  }
  return true;
}

// --- Pickups --------------------------------------------------------------------------

const PICKUP_FRAME: Record<PowerupKind, number> = {
  speed: 0,
  highJump: 1,
  flight: 2,
  invincible: 3,
  power: 4,
  autoShot: 5,
  longShot: 6,
  repair: 7,
};

export function drawPickupArt(
  ctx: CanvasRenderingContext2D,
  kind: PowerupKind,
  x: number,
  y: number,
  size: number,
  phase: number,
  risky: boolean,
): boolean {
  const icons = spriteFrames('powerup.icons');
  if (!icons) return false;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const pulse = 0.6 + Math.sin(phase * 6) * 0.25;
  ctx.fillStyle = alpha(risky ? '#6d7690' : '#fff6c8', 0.35 * pulse);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2);
  ctx.fill();
  const frame = icons[PICKUP_FRAME[kind]]!;
  const b = frameBounds(frame);
  const d = size * 1.25;
  const s = Math.min(d / b.w, d / b.h) * (1 + Math.sin(phase * 5) * 0.05);
  drawAnchored(ctx, frame, cx, cy + (b.h * s) / 2, s);
  return true;
}

// --- Effects -------------------------------------------------------------------------

/** Sparkle pops (additive flipbook) and cheered-up clouds floating away. */
export function drawFxArt(ctx: CanvasRenderingContext2D): void {
  const pops = spriteFrames('pop.fx');
  const happy = spriteFrames('cloud.happy');
  for (const f of juice.fx) {
    if (!f.active) continue;
    const t = f.age / f.life;
    if (f.kind === 'pop' && pops) {
      const frame = pops[Math.min(pops.length - 1, Math.floor(t * pops.length))]!;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const b = frameBounds(frame);
      const s = (f.size * (0.8 + t * 0.6)) / Math.max(b.w, b.h);
      drawAnchored(ctx, frame, f.x, f.y + (b.h * s) / 2, s);
      ctx.restore();
    } else if (f.kind === 'happy' && happy) {
      ctx.save();
      ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const frame = happy[2 + (f.frame % 2)]!;
      const b = frameBounds(frame);
      const s = f.size / b.w;
      const squash = 1 + Math.sin(t * Math.PI * 4) * 0.06 * (1 - t);
      drawAnchored(ctx, frame, f.x, f.y + (b.h * s) / 2, s, squash, 2 - squash);
      ctx.restore();
    }
  }
}

// --- Screens -------------------------------------------------------------------------

/** The title picture, cover-fitted, with Ellie waving on the left. */
export function drawTitleArt(ctx: CanvasRenderingContext2D): boolean {
  const picture = sprite('title');
  if (!picture) return false;
  const scale = Math.max(SCREEN.w / picture.width, VIRTUAL_H / picture.height);
  const w = picture.width * scale;
  const h = picture.height * scale;
  const was = SMOOTH(ctx, true);
  ctx.drawImage(picture, (SCREEN.w - w) / 2, (VIRTUAL_H - h) / 2, w, h);
  ctx.imageSmoothingEnabled = was;

  const mood = spriteFrames('ellie.mood');
  const run = spriteFrames('ellie.run');
  if (mood && run) {
    const s = ellieRefScale(run) * 2.6;
    const hop = Math.abs(Math.sin(juice.time * 2.2)) * 3;
    const cheer = Math.floor(juice.time / 2.4) % 3 === 2;
    drawAnchored(ctx, cheer ? mood[1]! : mood[3]!, SCREEN.w * 0.14, VIRTUAL_H - 30 - (cheer ? hop : 0), s);
  }
  const happy = spriteFrames('unicorn.happy');
  if (happy) {
    const b = frameBounds(happy[0]!);
    const s = 54 / b.h;
    const frame = happy[Math.floor(juice.time / 1.6) % 2 === 0 ? 3 : 0]!;
    drawAnchored(ctx, frame, SCREEN.w * 0.86, VIRTUAL_H - 32, s);
  }
  return true;
}

/** Ellie on the game-over screen: dizzy but happy, sitting down. Nobody's hurt. */
export function drawGameOverEllie(ctx: CanvasRenderingContext2D, x: number, bottom: number): boolean {
  const mood = spriteFrames('ellie.mood');
  const run = spriteFrames('ellie.run');
  if (!mood || !run) return false;
  const s = ellieRefScale(run) * 1.9;
  ctx.save();
  ctx.translate(x, bottom);
  ctx.rotate(Math.sin(juice.time * 2.5) * 0.06);
  drawAnchored(ctx, mood[2]!, 0, 0, s);
  ctx.restore();
  drawDizzyStars(ctx, x + 4, bottom - 46, 0);
  return true;
}

/** Dev: what was lifted out of each painted sky. */
export function debugSkies(): Record<string, { w: number; h: number; clouds: string[] }> {
  const out: Record<string, { w: number; h: number; clouds: string[] }> = {};
  for (const id of ['sky.day', 'sky.dusk', 'sky.night']) {
    const sky = prepared.get(id) as CleanSky | null | undefined;
    if (!sky) continue;
    (window as unknown as Record<string, unknown>)[`__${id.replace('.', '_')}`] = sky;
    out[id] = {
      w: sky.clean.width,
      h: sky.clean.height,
      clouds: sky.clouds.map((c) => `${c.x},${c.y} ${c.image.width}x${c.image.height}`),
    };
  }
  return out;
}
