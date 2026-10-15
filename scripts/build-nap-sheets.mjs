/**
 * build-nap-sheets.mjs — process the high-res falling-asleep contact sheets
 * (public/assets/cat/<cat>-sleep.png, 1024×1024, 4×4 grid of 256×256
 * transparent frames: frames 1-8 fall asleep, 9-16 sleep-loop) into the
 * 64px sprite format the cat assistant uses — a 256×256 PNG holding 16
 * nearest-neighbour 64×64 frames, pixel edges preserved.
 *
 * Reuse: point TARGETS at other 4×4 1024px sheets with the same layout.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAT_DIR = resolve(ROOT, 'public/assets/cat');

const TARGETS = [
  { source: 'hunao-sleep.png', output: 'hunao-falling-asleep.png' },
  { source: 'siam-sleep.png', output: 'siam-falling-asleep.png' },
  { source: 'heyhey-sleep.png', output: 'heyhey-falling-asleep.png' },
  { source: 'heyheyhey-sleep.png', output: 'heyheyhey-falling-asleep.png' },
  { source: 'ailu-sleep.png', output: 'ailu-falling-asleep.png' },
];

const GRID = 4;            // 4×4 frames
const SOURCE_SIZE = 1024;  // full sheet
const FRAME_IN = SOURCE_SIZE / GRID;  // 256
const FRAME_OUT = 64;      // pixel-art sprite size
const OUTPUT_SIZE = FRAME_OUT * GRID; // 256

// Safe content box per 64px frame. Some source frames (sleeping cats) are
// drawn edge-to-edge, so their ears/back are genuinely cut at the cell
// border — downscaling those into the safe box keeps every frame fully
// visible. Anchored to a shared ground line so poses don't drift.
const MAX_W = 58;
const MAX_H = 56;
const GROUND_Y = 60;
const ALPHA_MIN = 8;

/** Opaque bounding box of a 64×64 RGBA buffer. */
function bboxOf(buf) {
  let minX = FRAME_OUT, minY = FRAME_OUT, maxX = -1, maxY = -1;
  for (let y = 0; y < FRAME_OUT; y += 1) {
    for (let x = 0; x < FRAME_OUT; x += 1) {
      if (buf[(y * FRAME_OUT + x) * 4 + 3] > ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Keep only the LARGEST connected opaque blob of a raw 256px cell, zeroing
 * everything else. The source contact sheets have each row's cat bleeding a
 * few dozen px past its cell bottom, so every cell also contains the *feet
 * of the cat above* as a stray disconnected fragment — including it made
 * every built frame look like a sliced-off cat. 8-connectivity, alpha-gated.
 */
function keepLargestBlob(buf, size) {
  const seen = new Uint8Array(size * size);
  const label = new Int32Array(size * size).fill(-1);
  const blobs = [];
  const stack = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      if (seen[i] || buf[i * 4 + 3] <= ALPHA_MIN) continue;
      const id = blobs.length;
      let pixelCount = 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const cur = stack.pop();
        label[cur] = id;
        pixelCount += 1;
        const cx = cur % size;
        const cy = (cur / size) | 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const ni = ny * size + nx;
            if (!seen[ni] && buf[ni * 4 + 3] > ALPHA_MIN) {
              seen[ni] = 1;
              stack.push(ni);
            }
          }
        }
      }
      blobs.push({ id, pixelCount });
    }
  }
  if (blobs.length <= 1) return buf;
  const best = blobs.reduce((a, b) => (b.pixelCount > a.pixelCount ? b : a)).id;
  for (let i = 0; i < size * size; i += 1) {
    if (buf[i * 4 + 3] > ALPHA_MIN && label[i] !== best) {
      buf[i * 4 + 3] = 0;
    }
  }
  return buf;
}

for (const { source, output } of TARGETS) {
  const src = sharp(readFileSync(resolve(CAT_DIR, source))).ensureAlpha();
  const frameBuffers = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const cellRaw = await src
        .clone()
        .extract({ left: col * FRAME_IN, top: row * FRAME_IN, width: FRAME_IN, height: FRAME_IN })
        .raw()
        .toBuffer();
      // Drop the previous row's feet fragment before any measuring.
      keepLargestBlob(cellRaw, FRAME_IN);
      const cell = await sharp(cellRaw, { raw: { width: FRAME_IN, height: FRAME_IN, channels: 4 } })
        .resize(FRAME_OUT, FRAME_OUT, { kernel: 'nearest' })
        .raw()
        .toBuffer();

      const box = bboxOf(cell);
      let png;
      if (!box) {
        png = await sharp(cell, { raw: { width: FRAME_OUT, height: FRAME_OUT, channels: 4 } })
          .png()
          .toBuffer();
      } else {
        const scale = Math.min(1, MAX_W / box.w, MAX_H / box.h);
        const outW = Math.max(1, Math.round(box.w * scale));
        const outH = Math.max(1, Math.round(box.h * scale));
        const trimmed = await sharp(cell, { raw: { width: FRAME_OUT, height: FRAME_OUT, channels: 4 } })
          .extract({ left: box.minX, top: box.minY, width: box.w, height: box.h })
          .resize(outW, outH, { kernel: 'nearest' })
          .raw()
          .toBuffer();
        let lowest = -1;
        for (let y = outH - 1; y >= 0 && lowest < 0; y -= 1) {
          for (let x = 0; x < outW; x += 1) {
            if (trimmed[(y * outW + x) * 4 + 3] > ALPHA_MIN) { lowest = y; break; }
          }
        }
        const left = Math.min(FRAME_OUT - outW, Math.max(0, Math.floor((FRAME_OUT - outW) / 2)));
        const top = Math.min(FRAME_OUT - outH, Math.max(0, GROUND_Y - lowest));
        const placed = await sharp({
          create: { width: FRAME_OUT, height: FRAME_OUT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .composite([
            {
              input: await sharp(trimmed, { raw: { width: outW, height: outH, channels: 4 } }).png().toBuffer(),
              left,
              top,
            },
          ])
          .png()
          .toBuffer();
        png = placed;
      }
      frameBuffers.push({ input: png, left: col * FRAME_OUT, top: row * FRAME_OUT });
    }
  }
  const out = await sharp({
    create: {
      width: OUTPUT_SIZE,
      height: OUTPUT_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(frameBuffers)
    .png()
    .toBuffer();
  writeFileSync(resolve(CAT_DIR, output), out);
  console.log(`Built ${output} from ${source}`);
}
console.log('Done.');
