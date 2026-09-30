// build-app-photos.mjs
// Builds a browsable app-screenshot database for the ticket app.
//
// Walks App_Screenshots/ (excluding product-photo folders named 外观 / 机器外观),
// copies every image into public/app-photos/<productType>/<modelSlug>/<name>.webp,
// and writes public/app-photos/index.json describing the tree.
//
// Photos keep their already-compressed WebP form (no re-encode); originals that
// are jpg/png are re-encoded to WebP q=70 for consistency.
//
// Usage: node scripts/build-app-photos.mjs

import sharp from 'sharp';
import { readdir, stat, mkdir, copyFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'App_Screenshots');
const OUT = join(ROOT, 'public', 'app-photos');

const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const PRODUCT_PHOTO_DIRS = new Set(['外观', '机器外观']);

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'model';
}

// Strip noise from model folder names -> clean display name.
//   "X2 App Pictures"              -> "X2"
//   "T90 PRO OMNI App Screenshots v260202" -> "T90 PRO OMNI"
//   "GOAT LiDAR PRO v260429"       -> "GOAT LiDAR PRO"
//   "LilMilo App Screenshots v260512" -> "LilMilo"
function cleanModelName(raw, productType) {
  let name = raw;
  // Remove date/version tokens like v260409, v20250211, v251103
  name = name.replace(/\s*v\d{6,8}\b/gi, '');
  // Remove "App Pictures", "App Screenshots", "Appscreenshot", "APP screenshot", "App Snapshots", "App"
  name = name.replace(/\s*(App\s*Pictures|App\s*Screenshots?|Appscreenshot|APP\s*screenshot|App\s*Snapshots|App)\b/gi, '');
  name = name.trim().replace(/\s+/g, ' ');
  if (!name) name = productType;
  return name;
}

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      // Skip product-photo (外观) directories.
      if (PRODUCT_PHOTO_DIRS.has(ent.name)) continue;
      out.push(...(await walk(full)));
    } else if (IMG_EXTS.has(extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

async function ensureDir(p) { if (!existsSync(p)) await mkdir(p, { recursive: true }); }

async function main() {
  console.log(`Source: ${SRC}`);
  console.log(`Output: ${OUT}`);

  const productTypes = (await readdir(SRC, { withFileTypes: true }))
    .filter(e => e.isDirectory())
    .map(e => e.name);

  // productType -> modelSlug -> model info
  const tree = {};
  let totalPhotos = 0;
  let skipped = 0;

  for (const pt of productTypes) {
    const ptDir = join(SRC, pt);
    const modelDirs = (await readdir(ptDir, { withFileTypes: true })).filter(e => e.isDirectory());
    const ptOut = join(OUT, pt);
    await ensureDir(ptOut);

    const models = [];
    for (const md of modelDirs) {
      const srcModelDir = join(ptDir, md.name);
      const photos = await walk(srcModelDir);
      if (photos.length === 0) continue;

      const displayName = cleanModelName(md.name, pt);
      const slug = slugify(displayName);
      const modelOutDir = join(ptOut, slug);
      await ensureDir(modelOutDir);

      const photoEntries = [];
      for (const srcFile of photos) {
        const ext = extname(srcFile).toLowerCase();
        const base = basename(srcFile, ext);
        // Use a short hash to avoid filename collisions when names repeat.
        const hash = createHash('sha1').update(srcFile).digest('hex').slice(0, 6);
        const outName = `${slugify(base)}-${hash}.webp`;
        const outFile = join(modelOutDir, outName);

        try {
          let w = 0, h = 0;
          if (ext === '.webp') {
            await copyFile(srcFile, outFile);
            try { const m = await sharp(outFile).metadata(); w = m.width || 0; h = m.height || 0; } catch {}
          } else {
            // Re-encode jpg/png to webp.
            const info = await sharp(srcFile, { failOn: 'none' })
              .rotate()
              .webp({ quality: 70, effort: 4 })
              .toFile(outFile);
            w = info.width; h = info.height;
          }
          photoEntries.push({
            name: base,
            path: `/app-photos/${pt}/${slug}/${outName}`,
            w, h,
          });
          totalPhotos++;
        } catch (e) {
          skipped++;
          console.warn(`  skip ${srcFile}: ${e.message}`);
        }
      }

      if (photoEntries.length > 0) {
        models.push({
          id: slug,
          name: displayName,
          photoCount: photoEntries.length,
          photos: photoEntries,
        });
      }
    }
    // Sort models by name.
    models.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    tree[pt] = models;
  }

  const index = {
    generatedAt: new Date().toISOString(),
    productTypes,
    models: tree,
    totalPhotos,
  };

  const indexPath = join(OUT, 'index.json');
  await writeFile(indexPath, JSON.stringify(index));
  console.log(`\nDone. ${totalPhotos} photos indexed, ${skipped} skipped.`);
  console.log(`Index: ${indexPath}`);
  for (const pt of productTypes) {
    const ms = tree[pt] || [];
    console.log(`  ${pt}: ${ms.length} model(s), ${ms.reduce((s, m) => s + m.photoCount, 0)} photos`);
  }
}

import { writeFile } from 'node:fs/promises';
main().catch(e => { console.error(e); process.exit(1); });
