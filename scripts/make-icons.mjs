/**
 * Generates the PWA icons.
 *
 * Written as a script rather than committing PNGs by hand so the icon stays
 * editable: it's drawn from the same palette as the game, so when the art
 * direction changes (the 16-bit renderer is planned), you change these numbers
 * and re-run instead of trying to hand-edit a binary.
 *
 *   node scripts/make-icons.mjs
 *
 * No dependencies — it rasterises into an RGBA buffer and writes the PNG with
 * Node's built-in zlib.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---------------------------------------------------------------- raster ---

class Raster {
  constructor(size) {
    this.size = size;
    this.data = new Uint8Array(size * size * 4);
  }

  /** Source-over blend of a solid colour, so translucent glow layers stack. */
  fillRect(x, y, w, h, [r, g, b], a = 1) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.size, Math.round(x + w));
    const y1 = Math.min(this.size, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.size + px) * 4;
        this.data[i] = this.data[i] * (1 - a) + r * a;
        this.data[i + 1] = this.data[i + 1] * (1 - a) + g * a;
        this.data[i + 2] = this.data[i + 2] * (1 - a) + b * a;
        this.data[i + 3] = 255;
      }
    }
  }

  verticalGradient(top, bottom) {
    for (let y = 0; y < this.size; y++) {
      const t = y / (this.size - 1);
      const c = [0, 1, 2].map((k) => top[k] + (bottom[k] - top[k]) * t);
      this.fillRect(0, y, this.size, 1, c, 1);
    }
  }
}

// ------------------------------------------------------------------ png ----

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, body])));
  return Buffer.concat([length, typeBytes, body, crc]);
}

function encodePng(raster) {
  const { size, data } = raster;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay 0: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type; 0 (none) is fine here
  // because the image is flat colour blocks and compresses well regardless.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------------------- icon ----

// Straight from src/render/palette.ts.
const SKY_TOP = [13, 18, 48];
const SKY_BOTTOM = [5, 6, 15];
const PLAYER = [77, 226, 255];
const PLAYER_CORE = [232, 253, 255];
const GROUND_LINE = [58, 217, 255];
const SHOT = [255, 209, 102];
const SHOT_CORE = [255, 246, 216];

/**
 * The icon is authored on a 512 grid and scaled, with everything kept inside
 * the middle ~80%. Android crops maskable icons to a circle or squircle, so
 * anything near the edge is liable to be sliced off.
 */
function drawIcon(size) {
  const r = new Raster(size);
  const u = size / 512;
  r.verticalGradient(SKY_TOP, SKY_BOTTOM);

  // Horizon line — the ground the player runs along.
  r.fillRect(0, 372 * u, size, 8 * u, GROUND_LINE, 0.22);
  r.fillRect(0, 376 * u, size, 3 * u, GROUND_LINE, 1);

  // The runner, caught mid-jump. The gap between its feet and the ground line
  // is the whole point of the pose — landed reads as a mascot, airborne reads
  // as a game about jumping.
  const px = 124 * u;
  const py = 196 * u;
  const pw = 96 * u;
  const ph = 134 * u;
  r.fillRect(px - 18 * u, py - 18 * u, pw + 36 * u, ph + 36 * u, PLAYER, 0.16);
  r.fillRect(px - 9 * u, py - 9 * u, pw + 18 * u, ph + 18 * u, PLAYER, 0.32);
  r.fillRect(px, py, pw, ph, PLAYER, 1);
  r.fillRect(px + 16 * u, py + 22 * u, pw - 32 * u, ph - 58 * u, PLAYER_CORE, 1);
  // Visor, so the figure reads as facing right — the direction of travel.
  r.fillRect(px + pw - 40 * u, py + 34 * u, 24 * u, 16 * u, SKY_BOTTOM, 1);

  // Shot streaking away, which is what makes it read as this game and not just
  // a generic runner. Kept tight and bright; a long faint glow over a dark
  // background just turns muddy brown.
  r.fillRect(px + pw + 14 * u, py + 54 * u, 156 * u, 18 * u, SHOT, 0.16);
  r.fillRect(px + pw + 34 * u, py + 58 * u, 136 * u, 12 * u, SHOT, 1);
  r.fillRect(px + pw + 60 * u, py + 61 * u, 92 * u, 5 * u, SHOT_CORE, 1);

  // Landing shadow under the player, which sells the height of the jump.
  r.fillRect(px + 10 * u, 368 * u, pw - 20 * u, 5 * u, PLAYER, 0.4);

  return r;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512, 180]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(drawIcon(size)));
  console.log(`wrote ${file}`);
}
