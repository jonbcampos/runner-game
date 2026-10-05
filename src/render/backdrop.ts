/**
 * Makes the painted backdrop move: its clouds drift across the sky.
 *
 * The meadow art has its clouds painted in, and Gemini wouldn't paint them out
 * (asked twice to edit them away, it removed the horizon haze and left every
 * cloud exactly where it was). So this does it: once per image, at load.
 *
 *  1. **Model the sky.** For each row of the top half of the picture, fit the
 *     sky's colour as a straight line across the row (the dusk sky runs peach
 *     to lavender left to right, so a single colour per row isn't enough),
 *     fitted only to pixels that look like sky, then smooth those fits down
 *     the rows so a row that is mostly cloud borrows from its neighbours.
 *  2. **Mask the clouds.** Anything far enough from the model is cloud. The
 *     mask is grown a few pixels to catch the soft edges.
 *  3. **Repaint the sky** under the mask from the model: a clean backdrop.
 *  4. **Lift the clouds out** as separate images (one per connected blob that
 *     isn't cut off by the picture's edge), with soft alpha at their rims.
 *
 * Those lifted clouds are then the drifting ones, so they are exactly the
 * clouds that were painted, in exactly the painted style, at no API cost.
 */

export interface Cloud {
  image: HTMLCanvasElement;
  /** Where it was in the source picture, in source pixels. */
  x: number;
  y: number;
}

export interface CleanSky {
  clean: HTMLCanvasElement;
  clouds: Cloud[];
}

/** Only the top part of the picture is sky worth touching; below it are the hills and the sun. */
const SKY_PORTION = 0.58;
/** How far a pixel's colour must be from the sky model to count as cloud. */
const CLOUD_DISTANCE = 26;
const GROW = 3;

const cache = new WeakMap<HTMLCanvasElement, CleanSky | null>();

export function cleanSky(source: HTMLCanvasElement): CleanSky | null {
  if (cache.has(source)) return cache.get(source)!;
  let result: CleanSky | null = null;
  try {
    result = analyse(source);
  } catch {
    result = null;
  }
  cache.set(source, result);
  return result;
}

function analyse(source: HTMLCanvasElement): CleanSky | null {
  const w = source.width;
  const h = source.height;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const rows = Math.floor(h * SKY_PORTION);
  const img = ctx.getImageData(0, 0, w, rows);
  const d = img.data;

  // 1. The sky colour, row by row, as a straight line across each row.
  //
  // Slingshot fitted each row on the pixels near that row's MEDIAN colour.
  // That fails on a sky this full of clouds: wherever the clouds cover more
  // than half a row, the median is cloud, the "sky" for that row came out
  // white, and the cleaned sky had a white streak across it. So the model is
  // TRACKED instead: start from the calmest row near the top (almost always
  // clear sky), and fit each next row only on pixels close to the row before's
  // model. Sky changes slowly down the picture; clouds don't get a vote.
  const a = [new Float64Array(rows), new Float64Array(rows), new Float64Array(rows)];
  const b = [new Float64Array(rows), new Float64Array(rows), new Float64Array(rows)];
  const fitRow = (y: number, guess: (x: number, c: number) => number, tolerance: number): boolean => {
    let n = 0;
    let sx = 0;
    let sxx = 0;
    const sy = [0, 0, 0];
    const sxy = [0, 0, 0];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dist = Math.hypot(d[i]! - guess(x, 0), d[i + 1]! - guess(x, 1), d[i + 2]! - guess(x, 2));
      if (dist > tolerance) continue;
      n++;
      sx += x;
      sxx += x * x;
      for (let c = 0; c < 3; c++) {
        sy[c] += d[i + c]!;
        sxy[c] += x * d[i + c]!;
      }
    }
    const den = n * sxx - sx * sx;
    if (n < w * 0.08 || den === 0) return false;
    for (let c = 0; c < 3; c++) {
      b[c]![y] = (n * sxy[c]! - sx * sy[c]!) / den;
      a[c]![y] = (sy[c]! - b[c]![y]! * sx) / n;
    }
    return true;
  };

  // The calmest row in the top fifth: least colour spread is clearest sky.
  let start = 0;
  let calmest = Infinity;
  const tmp = new Uint8Array(w);
  for (let y = 0; y < Math.max(1, Math.floor(rows * 0.4)); y += 2) {
    let spread = 0;
    for (let c = 0; c < 3; c++) {
      for (let x = 0; x < w; x++) tmp[x] = d[(y * w + x) * 4 + c]!;
      const sorted = Array.from(tmp).sort((p, q) => p - q);
      spread += sorted[Math.floor(w * 0.9)]! - sorted[Math.floor(w * 0.1)]!;
    }
    if (spread < calmest) {
      calmest = spread;
      start = y;
    }
  }
  const med = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    for (let x = 0; x < w; x++) tmp[x] = d[(start * w + x) * 4 + c]!;
    med[c] = median(tmp);
  }
  if (!fitRow(start, (_x, c) => med[c]!, 45)) {
    for (let c = 0; c < 3; c++) a[c]![start] = med[c]!;
  }
  const track = (from: number, to: number, stepDir: number): void => {
    for (let y = from + stepDir; stepDir > 0 ? y < to : y >= to; y += stepDir) {
      const prev = y - stepDir;
      const guess = (x: number, c: number): number => a[c]![prev]! + b[c]![prev]! * x;
      if (!fitRow(y, guess, 18)) {
        for (let c = 0; c < 3; c++) {
          a[c]![y] = a[c]![prev]!;
          b[c]![y] = b[c]![prev]!;
        }
      }
    }
  };
  track(start, rows, 1);
  track(start, 0, -1);
  const model = (x: number, y: number, c: number): number => a[c]![y]! + b[c]![y]! * x;
  // 2. Mask: far from the model.
  const dist = new Float32Array(w * rows);
  const mask = new Uint8Array(w * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dd = Math.hypot(d[i]! - model(x, y, 0), d[i + 1]! - model(x, y, 1), d[i + 2]! - model(x, y, 2));
      dist[y * w + x] = dd;
      if (dd > CLOUD_DISTANCE) mask[y * w + x] = 1;
    }
  }
  // Grow, so the soft rims come with the cloud.
  const grown = new Uint8Array(w * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let yy = Math.max(0, y - GROW); yy <= Math.min(rows - 1, y + GROW); yy++) {
        for (let xx = Math.max(0, x - GROW); xx <= Math.min(w - 1, x + GROW); xx++) grown[yy * w + xx] = 1;
      }
    }
  }

  // Fill the holes. A cloud painted in nearly the sky's own colour (the dusk
  // sky's pink clouds on a peach sky) only differs from the model at its dark
  // outline, so the mask was a ring and the "cloud" lifted out was a line.
  // Anything the open sky can't reach from the picture's edge is inside a
  // cloud. (Added in the runner; slingshot's paler-sky clouds never needed it.)
  {
    const outside = new Uint8Array(w * rows);
    const stack: number[] = [];
    for (let x = 0; x < w; x++) {
      stack.push(x, (rows - 1) * w + x);
    }
    for (let y = 0; y < rows; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const p = stack.pop()!;
      if (outside[p] || grown[p]) continue;
      outside[p] = 1;
      const x = p % w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (p >= w) stack.push(p - w);
      if (p + w < w * rows) stack.push(p + w);
    }
    for (let p = 0; p < w * rows; p++) {
      if (!outside[p] && !grown[p]) {
        grown[p] = 1;
        dist[p] = Math.max(dist[p]!, 40);
      }
    }
  }

  // 4 (before 3, while the original pixels are still there): lift the clouds.
  const clouds: Cloud[] = [];
  const label = new Int32Array(w * rows);
  let next = 1;
  for (let start = 0; start < w * rows; start++) {
    if (!grown[start] || label[start]) continue;
    const stack = [start];
    label[start] = next;
    let minX = w;
    let minY = rows;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    while (stack.length) {
      const p = stack.pop()!;
      count++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * rows) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        if (grown[q] && !label[q]) {
          label[q] = next;
          stack.push(q);
        }
      }
    }
    const id = next++;
    // Skip specks, and clouds the picture's edge cuts in half: a half cloud
    // drifting into the middle of the sky would show its straight cut side.
    if (count < w * rows * 0.002 || minX <= 1 || maxX >= w - 2 || maxY >= rows - 1) continue;
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const cctx = canvas.getContext('2d');
    if (!cctx) continue;
    const out = cctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const p = (minY + y) * w + (minX + x);
        if (label[p] !== id) continue;
        const i = p * 4;
        const o = (y * cw + x) * 4;
        out.data[o] = d[i]!;
        out.data[o + 1] = d[i + 1]!;
        out.data[o + 2] = d[i + 2]!;
        // Soft rim: alpha rises with distance from the sky colour.
        out.data[o + 3] = Math.round(255 * Math.min(1, Math.max(0, (dist[p]! - 8) / 30)));
      }
    }
    cctx.putImageData(out, 0, 0);
    clouds.push({ image: canvas, x: minX, y: minY });
  }

  // 3. Repaint the sky under every grown mask pixel, edge-cut clouds included.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < w; x++) {
      if (!grown[y * w + x]) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = Math.round(model(x, y, c));
    }
  }
  const clean = document.createElement('canvas');
  clean.width = w;
  clean.height = h;
  const out = clean.getContext('2d');
  if (!out) return null;
  out.drawImage(source, 0, 0);
  out.putImageData(img, 0, 0);
  return { clean, clouds };
}

function median(values: Uint8Array): number {
  const counts = new Uint32Array(256);
  for (const v of values) counts[v]!++;
  let seen = 0;
  const half = values.length / 2;
  for (let v = 0; v < 256; v++) {
    seen += counts[v]!;
    if (seen >= half) return v;
  }
  return 0;
}
