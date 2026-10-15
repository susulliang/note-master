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

for (const { source, output } of TARGETS) {
  const src = sharp(readFileSync(resolve(CAT_DIR, source))).ensureAlpha();
  const frameBuffers = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const buf = await src
        .clone()
        .extract({ left: col * FRAME_IN, top: row * FRAME_IN, width: FRAME_IN, height: FRAME_IN })
        .resize(FRAME_OUT, FRAME_OUT, { kernel: 'nearest' })
        .png()
        .toBuffer();
      frameBuffers.push({ input: buf, left: col * FRAME_OUT, top: row * FRAME_OUT });
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
