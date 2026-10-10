import { createRequire } from "node:module";
import path from "node:path";
import { readdir, mkdir } from "node:fs/promises";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ASSETS = path.join(import.meta.dirname, "assets");
const OUT = path.join(ASSETS, "fit");
await mkdir(OUT, { recursive: true });

const files = (await readdir(ASSETS)).filter((f) => /^0\d_.*\.png$/.test(f));

// Target: 1280 wide, preserve aspect (1513x1120 -> 1280x948). Contain, white bg.
const TARGET_W = 1280;
const TARGET_H = Math.round(TARGET_W * 1120 / 1513); // 948

for (const f of files) {
  const src = path.join(ASSETS, f);
  const dst = path.join(OUT, `fit_${f}`);
  await sharp(src)
    .rotate()
    .resize({
      width: TARGET_W,
      height: TARGET_H,
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toFile(dst);
  const meta = await sharp(dst).metadata();
  console.log(`${f} -> fit_${f}  ${meta.width}x${meta.height}`);
}

console.log("done");
