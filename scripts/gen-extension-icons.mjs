// Generate four tiny extension icons (16/32/48/128) as PNGs without
// any external package. Outputs them into extension/icons/*.png.
// Art: rounded GitHub-Dark glass square with a green ticket glyph (a phone
// handset + checkmark). Simple, recognisable at 16px.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'extension', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

// RGBA palette.
const PAL = {
  bgTop:    [0x1d, 0x26, 0x33, 0xff], // dark card top
  bgBot:    [0x0d, 0x11, 0x17, 0xff], // deep GitHub bg
  border:   [0x30, 0x36, 0x3d, 0xff], // frame
  primary:  [0x2e, 0xa0, 0x43, 0xff], // GitHub green light
  primaryD: [0x23, 0x86, 0x36, 0xff],
  accent:   [0x58, 0xa6, 0xff, 0xff],
  white:    [0xe6, 0xed, 0xf3, 0xff],
  shadow:   [0x00, 0x00, 0x00, 0x40],
  transp:   [0x00, 0x00, 0x00, 0x00],
};

function draw(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  const p = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // alpha blend over existing pixel
    const a = rgba[3] / 255;
    if (a === 0) return;
    if (a === 1) { data[i] = rgba[0]; data[i+1] = rgba[1]; data[i+2] = rgba[2]; data[i+3] = rgba[3]; return; }
    const dstA = data[i+3] / 255;
    const outA = a + dstA * (1 - a);
    for (let c = 0; c < 3; c += 1) {
      data[i+c] = Math.round((rgba[c]*a + data[i+c]*dstA*(1-a)) / outA);
    }
    data[i+3] = Math.round(outA * 255);
  };

  const r = Math.max(2, Math.round(size * 0.18));
  // Shadow layer (offset)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xs = x - Math.max(1, size*0.04);
      const ys = y + Math.max(1, size*0.06);
      const inRounded = xs > 0 && xs < size-1 && ys > 0 && ys < size-1
        && (xs < r && ys < r ? ((r-xs)**2 + (r-ys)**2) <= r*r : true)
        && (xs > size-1-r && ys < r     ? ((xs-(size-1-r))**2 + (r-ys)**2) <= r*r : true)
        && (xs < r             && ys > size-1-r ? ((r-xs)**2 + ((size-1-r)-ys)**2) <= r*r : true)
        && (xs > size-1-r && ys > size-1-r ? (((xs-(size-1-r))**2 + ((size-1-r)-ys)**2) <= r*r) : true);
      if (inRounded && (xs === 0 || ys === 0 || xs === size-1 || ys === size-1)) continue;
      if (inRounded) p(x, y, PAL.shadow);
    }
  }
  // Rounded square body with vertical gradient + 1px border.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inset = 0;
      const xi = x - inset, yi = y - inset;
      const s = size - 2*inset;
      const inside = xi > 0 && xi < s-1 && yi > 0 && yi < s-1
        ? (xi < r && yi < r                 ? ((r-xi)**2 + (r-yi)**2)                 <= r*r : true)
       && (xi > s-1-r && yi < r             ? ((xi-(s-1-r))**2 + (r-yi)**2)         <= r*r : true)
       && (xi < r && yi > s-1-r             ? ((r-xi)**2 + ((s-1-r)-yi)**2)         <= r*r : true)
       && (xi > s-1-r && yi > s-1-r         ? ((xi-(s-1-r))**2 + ((s-1-r)-yi)**2)   <= r*r : true)
        : xi === 0 && yi === 0 ? false : false;
      const edge = Math.min(xi, yi, (s-1)-xi, (s-1)-yi) === 0;
      if (inside || edge) {
        const t = s <= 1 ? 0.5 : yi / (s-1);
        const col = [
          Math.round(PAL.bgTop[0]*(1-t) + PAL.bgBot[0]*t),
          Math.round(PAL.bgTop[1]*(1-t) + PAL.bgBot[1]*t),
          Math.round(PAL.bgTop[2]*(1-t) + PAL.bgBot[2]*t),
          0xff,
        ];
        p(x, y, edge ? PAL.border : col);
      }
    }
  }

  // --- Glyph: "📋" style ticket = document card + green phone + checkmark.
  // Rendered at sizes scaled to the icon size.
  const cx = size / 2;
  const cy = size / 2;
  const u = (n) => Math.max(1, Math.round(size * n / 128)); // unit scaled by 128 grid

  // (A) Phone handset icon (the CCP side): rotated handset base.
  // Draw a thick rounded rectangle rotated 35deg to look like a receiver.
  const px = cx - u(6);
  const py = cy - u(2);
  // Phone base at lower-left (rounded bar), angled slightly toward corner.
  drawFilledRoundedRect(data, size, p,
    px - u(22), py + u(14), u(26), u(10), u(3), PAL.primary);
  drawFilledRoundedRect(data, size, p,
    px - u(30), py + u(2),  u(10), u(26), u(3), PAL.primary);
  drawFilledRoundedRect(data, size, p,
    px - u(38), py + u(26), u(12), u(8),  u(2), PAL.white);
  // Microphone nub on top of the receiver
  drawFilledRoundedRect(data, size, p,
    px - u(32), py - u(8), u(14), u(10), u(3), PAL.primary);

  // (B) Ticket tab: top-right corner white card with green checkmark.
  const cardX = px - u(2);
  const cardY = py - u(42);
  drawFilledRoundedRect(data, size, p, cardX, cardY, u(48), u(54), u(4), PAL.white);
  // Card header line (accent)
  for (let i = 0; i < u(48); i += 1) {
    p(cardX + i, cardY + u(12), PAL.accent);
    p(cardX + i, cardY + u(13), PAL.accent);
  }
  // 3 document bullet lines
  drawFilledRoundedRect(data, size, p, cardX + u(6), cardY + u(20), u(36), u(4), u(2), [0x9b,0xa4,0xaf,0xff]);
  drawFilledRoundedRect(data, size, p, cardX + u(6), cardY + u(30), u(32), u(4), u(2), [0x9b,0xa4,0xaf,0xff]);
  drawFilledRoundedRect(data, size, p, cardX + u(6), cardY + u(40), u(20), u(4), u(2), [0x9b,0xa4,0xaf,0xff]);
  // Green checkmark badge
  const bx = cardX + u(30);
  const by = cardY + u(40);
  drawCircleFill(data, size, p, bx, by, u(10), PAL.primary);
  // Check shape
  drawLineThick(data, size, p, bx - u(5), by,      bx - u(1), by + u(4), u(2), PAL.white);
  drawLineThick(data, size, p, bx - u(1), by + u(4), bx + u(5), by - u(4), u(2), PAL.white);

  // Rim highlight: a soft 1px green light around the top edge
  for (let x = r * 0.55; x < size - 1 - r * 0.55; x += 1) {
    p(Math.floor(x), 1, [0x2e, 0xa0, 0x43, 0x55]);
  }
  return data;
}

function drawFilledRoundedRect(data, size, p, x, y, w, h, r, rgba) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); r = Math.round(r);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      // corner check
      let inside = true;
      if (i < r && j < r)                   inside = ((r-i-1)**2 + (r-j-1)**2) < r*r;
      else if (i >= w-r && j < r)          inside = (((i-(w-r))**2 + (r-j-1)**2) < r*r);
      else if (i < r && j >= h-r)          inside = (((r-i-1)**2 + (j-(h-r))**2) < r*r);
      else if (i >= w-r && j >= h-r)       inside = (((i-(w-r))**2 + (j-(h-r))**2) < r*r);
      if (inside) p(x + i, y + j, rgba);
    }
  }
}

function drawCircleFill(data, size, p, cx, cy, radius, rgba) {
  const r = Math.round(radius);
  for (let j = -r; j <= r; j += 1) {
    for (let i = -r; i <= r; i += 1) {
      if (i*i + j*j <= r*r) p(Math.round(cx + i), Math.round(cy + j), rgba);
    }
  }
}

function drawLineThick(data, size, p, x0, y0, x1, y1, t, rgba) {
  // Bresenham with radius-t thickness
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  while (true) {
    drawCircleFill(data, size, p, x, y, Math.max(1, Math.round((t-1)/2 + 0.5)), rgba);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// CRC32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = data.length;
  const out = Buffer.alloc(len + 12);
  out.writeUInt32BE(len, 0);
  out.write(type, 4);
  data.copy(out, 8);
  const crcBuf = Buffer.allocUnsafe(len + 4);
  out.copy(crcBuf, 0, 4, 8 + len);
  out.writeUInt32BE(crc32(crcBuf), 8 + len);
  return out;
}
function encodePng(width, height, rgba) {
  // PNG signature + IHDR + IDAT(deflated raw rows, each preceded by filter byte 0) + IEND
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace (none)
  // raw: filter byte 0 + per-row RGBA bytes
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = Buffer.from(deflateSync(raw, { level: 9 }));
  const iend = Buffer.alloc(0);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', iend),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const pixels = draw(size);
  const png = encodePng(size, size, pixels);
  const out = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}

console.log('Done.');
