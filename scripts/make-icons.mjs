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

// Straight from the UNICORN palette in src/render/palette.ts — the icon should
// match the theme the game boots into, since that's what sits on the home
// screen next to everything else.
const SKY_TOP = [127, 199, 255];
const SKY_BOTTOM = [255, 217, 238];
const GRASS = [87, 173, 104];
const DRESS = [255, 126, 179];
const TRIM = [255, 243, 248];
const SKIN = [240, 195, 154];
const HAIR = [168, 118, 63];
const RAINBOW = [
  [255, 143, 174],
  [255, 196, 107],
  [255, 240, 106],
  [143, 224, 143],
  [127, 199, 255],
  [199, 155, 255],
];

/**
 * The icon is authored on a 512 grid and scaled, with everything kept inside
 * the middle ~80%. Android crops maskable icons to a circle or squircle, so
 * anything near the edge is liable to be sliced off.
 */
function drawIcon(size) {
  const r = new Raster(size);
  const u = size / 512;
  r.verticalGradient(SKY_TOP, SKY_BOTTOM);

  // Rainbow arc behind her. Drawn as stacked bands rather than a stroked curve
  // because the rasteriser only knows rectangles.
  const cx = 256 * u;
  const cy = 400 * u;
  for (let i = 0; i < RAINBOW.length; i++) {
    const radius = (200 - i * 18) * u;
    const band = 18 * u;
    for (let a = 0; a <= 180; a += 2) {
      const rad = (a * Math.PI) / 180;
      const bx = cx - Math.cos(rad) * radius;
      const by = cy - Math.sin(rad) * radius;
      r.fillRect(bx - band / 2, by - band / 2, band, band, RAINBOW[i], 0.9);
    }
  }

  // Meadow.
  r.fillRect(0, 372 * u, size, size - 372 * u, GRASS, 1);
  r.fillRect(0, 372 * u, size, 5 * u, TRIM, 0.9);

  // Ellie, mid-jump. The gap under her feet is the point of the pose: landed
  // reads as a mascot, airborne reads as a game about jumping.
  const px = 186 * u;
  const py = 196 * u;
  const pw = 140 * u;

  // Hair streaming behind her. Overlaps the head block so it reads as one mass
  // rather than a brown rectangle floating alongside her.
  r.fillRect(px - 18 * u, py + 18 * u, 58 * u, 96 * u, HAIR, 1);

  // Legs.
  r.fillRect(px + 34 * u, py + 118 * u, 30 * u, 44 * u, SKIN, 1);
  r.fillRect(px + 76 * u, py + 126 * u, 30 * u, 36 * u, SKIN, 1);

  // Dress: narrow bodice, wide hem, white trim like the real one.
  r.fillRect(px + 30 * u, py + 62 * u, 76 * u, 44 * u, DRESS, 1);
  r.fillRect(px + 12 * u, py + 100 * u, 116 * u, 32 * u, DRESS, 1);
  r.fillRect(px + 12 * u, py + 126 * u, 116 * u, 12 * u, TRIM, 1);
  r.fillRect(px + 42 * u, py + 62 * u, 14 * u, 40 * u, TRIM, 1);

  // Head and hair.
  r.fillRect(px + 36 * u, py + 6 * u, 66 * u, 62 * u, SKIN, 1);
  r.fillRect(px + 28 * u, py - 8 * u, 82 * u, 30 * u, HAIR, 1);
  r.fillRect(px + 28 * u, py + 14 * u, 22 * u, 46 * u, HAIR, 1);
  r.fillRect(px + 76 * u, py + 30 * u, 14 * u, 12 * u, [58, 43, 34], 1);

  // Shadow on the grass, which sells the height of the jump.
  r.fillRect(px + 20 * u, 366 * u, 100 * u, 8 * u, [40, 110, 60], 0.35);

  return r;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512, 180]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(drawIcon(size)));
  console.log(`wrote ${file}`);
}
