/**
 * repair-nap-sheets.mjs — fix clipping in the falling-asleep sprite sheets.
 *
 * The 16-frame nap sheets were drawn with transition frames that overflow
 * their 64×64 cells (ears/back cut at the top edge, feet cut at the bottom,
 * and in the worst case a full-bleed zoom crop). Rendering CSS is a plain
 * 4×4 grid, so any pixel outside a cell is simply never shown.
 *
 * Repair pass, per sheet:
 *   1. Frame 1 (row 0, col 0) is replaced with the idle sheet's standing
 *      frame so the nap starts from — and wakes back to — the exact idle pose.
 *   2. Every other frame's opaque content is measured and, when it exceeds
 *      the safe box, downscaled (nearest-neighbour, keeps pixel edges crisp).
 *   3. Content is re-anchored: horizontally centred, bottom baseline at a
 *      fixed ground line, so frames don't drift or float between poses.
 *
 * Reuse: point TARGETS at other 4×4 256px sheets with the same problem.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAT_DIR = resolve(ROOT, 'public/assets/cat');

const TARGETS = [
  { sheet: 'hunao-falling-asleep.png', idle: 'hunao-sprites.png' },
  { sheet: 'siam-falling-asleep.png', idle: 'siam-sprites.png' },
  { sheet: 'heyhey-falling-asleep.png', idle: 'heyhey-sprites.png' },
  { sheet: 'heyheyhey-falling-asleep.png', idle: 'heyheyhey-sprites.png' },
  { sheet: 'ailu-falling-asleep.png', idle: 'ailu-sprites.png' },
];

const FRAME = 64;
const MAX_W = 54;   // safe content box
const MAX_H = 54;
const GROUND_Y = 60; // bottom baseline (content's lowest row lands here)
const ALPHA_MIN = 8; // alpha above this counts as content

/** Opaque bounding box of a 64×64 RGBA buffer. */
function bboxOf(buf) {
  let minX = FRAME, minY = FRAME, maxX = -1, maxY = -1;
  for (let y = 0; y < FRAME; y += 1) {
    for (let x = 0; x < FRAME; x += 1) {
      if (buf[(y * FRAME + x) * 4 + 3] > ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

for (const { sheet, idle } of TARGETS) {
  const sheetPath = resolve(CAT_DIR, sheet);
  const base = sharp(readFileSync(sheetPath)).ensureAlpha();
  const cells = [];
  for (let i = 0; i < 16; i += 1) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    cells.push(
      await base
        .clone()
        .extract({ left: col * FRAME, top: row * FRAME, width: FRAME, height: FRAME })
        .raw()
        .toBuffer()
    );
  }

  // Frame 1 comes from the idle sheet's standing pose (seamless nap start/wake end).
  const idleFrame0 = await sharp(readFileSync(resolve(CAT_DIR, idle)))
    .ensureAlpha()
    .extract({ left: 0, top: 0, width: FRAME, height: FRAME })
    .raw()
    .toBuffer();
  cells[0] = idleFrame0;

  // Frame 1 verbatim (already the idle standing pose), then the normalized frames.
  const composed = [
    {
      input: await sharp(cells[0], { raw: { width: FRAME, height: FRAME, channels: 4 } })
        .png()
        .toBuffer(),
      left: 0,
      top: 0,
    },
  ];
  for (let i = 1; i < 16; i += 1) {
    const box = bboxOf(cells[i]);
    if (!box) continue; // empty cell — leave transparent
    const scale = Math.min(1, MAX_W / box.w, MAX_H / box.h);
    const outW = Math.max(1, Math.round(box.w * scale));
    const outH = Math.max(1, Math.round(box.h * scale));
    const trimmed = await sharp(cells[i], { raw: { width: FRAME, height: FRAME, channels: 4 } })
      .extract({ left: box.minX, top: box.minY, width: box.w, height: box.h })
      .resize(outW, outH, { kernel: 'nearest' })
      .raw()
      .toBuffer();

    // Snap the content down onto the ground line: shift so the lowest
    // opaque row sits exactly at GROUND_Y (no floating / ragged baselines).
    let lowest = -1;
    for (let y = outH - 1; y >= 0 && lowest < 0; y -= 1) {
      for (let x = 0; x < outW; x += 1) {
        if (trimmed[(y * outW + x) * 4 + 3] > ALPHA_MIN) { lowest = y; break; }
      }
    }
    const left = Math.min(FRAME - outW, Math.max(0, Math.floor((FRAME - outW) / 2)));
    const top = Math.min(FRAME - outH, Math.max(0, GROUND_Y - lowest));
    const cellLeft = (i % 4) * FRAME;
    const cellTop = Math.floor(i / 4) * FRAME;
    composed.push({
      input: await sharp(trimmed, { raw: { width: outW, height: outH, channels: 4 } })
        .png()
        .toBuffer(),
      left: cellLeft + left,
      top: cellTop + top,
    });
  }

  const out = await sharp({
    create: { width: FRAME * 4, height: FRAME * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composed)
    .png()
    .toBuffer();
  writeFileSync(sheetPath, out);
  console.log(`Repaired ${sheet}`);
}
console.log('Done.');
