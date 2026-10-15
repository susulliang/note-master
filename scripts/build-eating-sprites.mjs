#!/usr/bin/env node
/**
 * build-eating-sprites.mjs — process the high-res heyheyhey eating-can
 * contact sheet (public/assets/cat/heyheyhey-eating-can.png, 1024×1024,
 * 4×4 grid of 256×256 transparent frames) into the 64px sprite format the
 * cat assistant uses: a 256×256 PNG holding 16 nearest-neighbour 64×64
 * frames, pixel edges preserved.
 *
 * Reuse: point SOURCE/OUTPUT at another sheet with the same 4×4 layout.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'public/assets/cat/heyheyhey-eating-can.png');
const OUTPUT = resolve(ROOT, 'public/assets/cat/heyheyhey-eating-sprites.png');

const GRID = 4;            // 4×4 frames
const SOURCE_SIZE = 1024;  // full sheet
const FRAME_IN = SOURCE_SIZE / GRID;  // 256
const FRAME_OUT = 64;      // pixel-art sprite size
const OUTPUT_SIZE = FRAME_OUT * GRID; // 256

const source = sharp(readFileSync(SOURCE), { density: 96 })
  .ensureAlpha();

/** Downscale one frame to 64×64. Nearest-neighbour keeps the pixel-art
 *  edges crisp — box/bilinear would blur the 1px outlines away. */
const frameBuffers = [];
for (let row = 0; row < GRID; row += 1) {
  for (let col = 0; col < GRID; col += 1) {
    const buf = await source
      .clone()
      .extract({ left: col * FRAME_IN, top: row * FRAME_IN, width: FRAME_IN, height: FRAME_IN })
      .resize(FRAME_OUT, FRAME_OUT, { kernel: 'nearest' })
      .png()
      .toBuffer();
    frameBuffers.push({ input: buf, left: col * FRAME_OUT, top: row * FRAME_OUT });
  }
}

await sharp({
  create: {
    width: OUTPUT_SIZE,
    height: OUTPUT_SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(frameBuffers)
  .png()
  .toBuffer()
  .then((buf) => writeFileSync(OUTPUT, buf));

console.log(`Wrote ${OUTPUT} (${OUTPUT_SIZE}×${OUTPUT_SIZE}, 16 frames of ${FRAME_OUT}×${FRAME_OUT})`);
