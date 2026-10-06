/** SKU DB builder — v2, concurrent images, per-file progress. */
import { readdirSync, readFileSync, existsSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

// --- External deps via dynamic import -----------------------------------
const XLSX = (await import('xlsx')).default;
const AdmZip = (await import('adm-zip')).default;
const sharp = (await import('sharp')).default;

// --- Config -------------------------------------------------------------
const SRC_DIR = 'SKU_202610';
const OUT_DIR = 'public/sku-db';
const OUT_IMAGES = join(OUT_DIR, 'images');
const SKU_JSON = join(OUT_DIR, 'sku-index.json');
const META_JSON = join(OUT_DIR, '_meta.json');
const CONCURRENCY = 6; // parallel sharp workers
// Thumbnails are named by part index — wipe the previous build so stale
// images (from a differently-sized index) don't linger in the output.
rmSync(OUT_IMAGES, { recursive: true, force: true });
mkdirSync(OUT_IMAGES, { recursive: true });

// --- Helpers ------------------------------------------------------------
function modelFromFilename(filename) {
  const noExt = filename.replace(/\.xlsx?$/i, '');
  let s = noExt.replace(/[-_\s.,]*[A-Za-z]{3,9}[.,]?\s*\d{4}[-.\s]*$/, '');
  s = s.replace(/\s*Spare\s*Parts\s*(Price\s*)?List\s*-?\s*$/i, '').trim();
  return s.replace(/\s+/g, ' ').trim();
}

function detectHeaderMap(headerRow) {
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    const raw = String(headerRow[i] ?? '').trim().toLowerCase();
    if (!raw) continue;
    if (/(part\s*number|sap[-_ ]?id|^sap$)/.test(raw)) map[i] = 'sku';
    else if (/(名称|parts?\s*name|chinese)/.test(raw)) map[i] = 'zh';
    else if (/(description|english|英文)/.test(raw)) map[i] = 'en';
    else if (/(type|类型)/.test(raw)) map[i] = 'type';
    else if (/(market|市场|region)/.test(raw)) map[i] = 'market';
    else if (/(price|fob|price\s*to)/.test(raw)) map[i] = 'price';
    else if (/(moq|最小)/.test(raw)) map[i] = 'moq';
    else if (/(qty|数量)/.test(raw)) map[i] = 'qty';
  }
  return map;
}

function parseRels(xml) {
  const map = {};
  const relRe = /<Relationship\s+Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
  let m;
  while ((m = relRe.exec(xml)) !== null) map[m[1]] = m[2];
  return map;
}

function detectRegionFromSheet(sheetName) {
  const t = sheetName.trim().toUpperCase();
  if (/^(KR|INA|IN|TW|CN|US|EU|JP|RU|TH)($|\\s)/.test(t)) return t.split(' ')[0];
  if (/^TW\s*SPARE/.test(sheetName.toUpperCase())) return 'TW';
  return null;
}

function detectStation(sheetName, filename) {
  return /\b(station|base|omni station|empty station)\b/i.test(`${filename} ${sheetName}`);
}

// --- Shared: parse all sheet refs for a workbook -----------------------
/** Returns Map<sheetName → {sheetFile, sheetRelsFile}> */
function buildSheetRefMap(entries) {
  const wbEntry = entries.find((e) => e.entryName === 'xl/workbook.xml');
  if (!wbEntry) return new Map();
  const wbXml = wbEntry.getData().toString('utf-8');
  // Sheet name → rId
  const sheetRidMap = new Map();
  const sheetRe = /<sheet\s[^>]*name="([^"]+)"\s[^>]*r:id="(rId\d+)"/g;
  let m;
  while ((m = sheetRe.exec(wbXml)) !== null) sheetRidMap.set(m[1], m[2]);

  // rId → worksheet target
  const wbRelsEntry = entries.find((e) => e.entryName === 'xl/_rels/workbook.xml.rels');
  if (!wbRelsEntry) return new Map();
  const wbRels = parseRels(wbRelsEntry.getData().toString('utf-8'));

  const result = new Map();
  for (const [name, rid] of sheetRidMap) {
    const target = wbRels[rid]; // e.g. "worksheets/sheet1.xml"
    if (!target) continue;
    const sheetFile = 'xl/' + target.replace(/^\.\.\//g, '');
    const sheetRelsFile = sheetFile.replace(/\.xml$/, '.xml.rels').replace('worksheets/', 'worksheets/_rels/');
    result.set(name, { sheetFile, sheetRelsFile });
  }
  return result;
}

// --- Shared: extract drawing anchors (picture-only) ---------------------
/** Returns [{row, rId}] for anchors that contain an <a:blip r:embed="..."> */
function parseDrawingAnchors(xml) {
  const anchors = [];
  const anchorRe = /<(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)>/g;
  let m;
  while ((m = anchorRe.exec(xml)) !== null) {
    const block = m[1];
    // Only anchors that have a blip with r:embed (real images, not AutoShapes)
    const ridM = block.match(/<a:blip[^>]*r:embed="(rId\d+)"/);
    const rowM = block.match(/<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/);
    if (ridM && rowM) anchors.push({ row: parseInt(rowM[1], 10), rId: ridM[1] });
  }
  return anchors;
}

// --- Shared: extract image maps for a sheet -----------------------------
/** Returns Map<anchorRow0based → image Buffer> for the given sheet. */
function extractSheetImages(zip, sheetName, allMedia, sheetRefMap) {
  const refs = sheetRefMap.get(sheetName);
  if (!refs) return new Map();
  const entries = zip.getEntries();

  const sheetRelsEntry = entries.find((e) => e.entryName === refs.sheetRelsFile);
  if (!sheetRelsEntry) return new Map();

  const sheetRels = parseRels(sheetRelsEntry.getData().toString('utf-8'));
  const anchorMap = new Map(); // row → Buffer

  for (const [, target] of Object.entries(sheetRels)) {
    if (!/drawings/.test(target)) continue;
    // Resolve path: "../drawings/drawing1.xml" → "xl/drawings/drawing1.xml"
    const resolved = 'xl/' + target.replace(/^\.\.\//g, '');
    const drawEntry = entries.find((e) => e.entryName === resolved);
    if (!drawEntry) continue;
    const drawXml = drawEntry.getData().toString('utf-8');
    const anchors = parseDrawingAnchors(drawXml);

    // Drawing rels → media target. Path conversion:
    //   xl/drawings/drawing1.xml → xl/drawings/_rels/drawing1.xml.rels
    //   xl/drawings/vmlDrawing1.vml → xl/drawings/_rels/vmlDrawing1.vml.rels
    const baseDir = resolved.includes('/') ? resolved.slice(0, resolved.lastIndexOf('/')) : '';
    const file = resolved.includes('/') ? resolved.slice(resolved.lastIndexOf('/') + 1) : resolved;
    const drawRelsPath = `${baseDir}/_rels/${file}.rels`;
    const drawRelsEntry = entries.find((e) => e.entryName === drawRelsPath);
    if (!drawRelsEntry) continue;
    const drawRels = parseRels(drawRelsEntry.getData().toString('utf-8'));

    for (const a of anchors) {
      const relTarget = drawRels[a.rId];
      if (!relTarget) continue;
      const mediaName = relTarget.replace(/^\.\.\//, '').split('/').pop();
      const buf = allMedia.get(mediaName);
      if (!buf || buf.length < 50) continue;
      if (!anchorMap.has(a.row)) anchorMap.set(a.row, buf);
    }
  }
  return anchorMap;
}

// --- Shared: extract header row + col map for a sheet -------------------
function findHeader(grid) {
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const joined = (grid[i] || []).map((c) => String(c ?? '')).join(' ').toLowerCase();
    if (/part\s*number|sap[-_ ]?id/.test(joined)) return i;
  }
  // Fallback: first row with >=6 non-empty cells
  for (let i = 0; i < Math.min(grid.length, 8); i++) {
    const nonEmpty = (grid[i] || []).filter((c) => String(c ?? '').trim()).length;
    if (nonEmpty >= 6) return i;
  }
  return -1;
}

// --- Batcher: run promises with concurrency ----------------------------
async function runBatched(items, worker, concurrency = 6) {
  const results = new Array(items.length);
  let idx = 0;
  async function runner() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

// --- MAIN ---------------------------------------------------------------
const files = readdirSync(SRC_DIR).filter(
  (f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$') // skip Excel lock files
);
const allParts = [];
const modelRegistry = new Set();
let totalOrigKB = 0;
let totalImagesMatched = 0;
let totalImagesOutput = 0;

console.log(`Processing ${files.length} workbooks...\n`);

for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
  const filename = files[fileIdx];
  const t0 = Date.now();
  const wbPath = join(SRC_DIR, filename);
  totalOrigKB += statSync(wbPath).size / 1024;

  const wb = XLSX.readFile(wbPath, { cellNF: true, cellStyles: false });
  const zip = new AdmZip(wbPath);
  // Pre-load all media into a Map<name, Buffer> (filter out empty/SVG)
  const mediaMap = new Map();
  for (const e of zip.getEntries()) {
    if (!e.entryName.startsWith('xl/media/')) continue;
    const buf = e.getData();
    if (buf && buf.length >= 50) {
      mediaMap.set(e.entryName.split('/').pop(), buf);
    }
  }

  const fileModel = modelFromFilename(filename);
  modelRegistry.add(fileModel);

  const sheetRefMap = buildSheetRefMap(zip.getEntries());

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (grid.length < 3) continue;

    const headerIdx = findHeader(grid);
    if (headerIdx < 0) continue;
    const colMap = detectHeaderMap(grid[headerIdx]);

    const regionFromSheet = detectRegionFromSheet(sheetName);
    const isStation = detectStation(sheetName, filename);

    const rowAnchorMap = extractSheetImages(zip, sheetName, mediaMap, sheetRefMap);

    let emptyStreak = 0;
    for (let r = headerIdx + 1; r < grid.length; r++) {
      const row = grid[r];
      const get = (field) => {
        const ci = Object.keys(colMap).find((k) => colMap[k] === field);
        if (ci === undefined) return '';
        const v = row[parseInt(ci, 10)];
        return v == null ? '' : String(v).trim();
      };

      const sku = get('sku').replace(/\s+/g, ' ');
      if (!sku || !/\d/.test(sku)) {
        // Some workbooks have formatting down to row 1,048,576 with no data.
        // Bail after 50 consecutive empty rows to avoid grinding 1M rows.
        emptyStreak++;
        if (emptyStreak > 50) break;
        continue;
      }
      emptyStreak = 0;

      const model = isStation ? `${fileModel} Station` : fileModel;
      modelRegistry.add(model);

      allParts.push({
        sku,
        en: get('en'),
        zh: get('zh'),
        type: get('type') || undefined,
        region: regionFromSheet || get('market') || undefined,
        model,
        sheet: sheetName,
        isStation,
        file: filename,
        price: get('price') || undefined,
        moq: get('moq') || undefined,
        qty: get('qty') || undefined,
        _imgAnchorRow: rowAnchorMap.get(r), // raw Buffer, processed later
      });
    }
    totalImagesMatched += [...rowAnchorMap.values()].length;
  }

  const dt = Date.now() - t0;
  process.stdout.write(`  [${fileIdx + 1}/${files.length}] ${filename.slice(0, 56).padEnd(60)} ${dt}ms\n`);
}

console.log(`\n─── Image resize (${CONCURRENCY} workers) ───`);
const imageJobs = [];
for (let i = 0; i < allParts.length; i++) {
  const p = allParts[i];
  if (p._imgAnchorRow) imageJobs.push({ i, buf: p._imgAnchorRow });
}
console.log(`Parts with matched images: ${imageJobs.length}`);

let doneCount = 0;
const results = await runBatched(imageJobs, async (job) => {
  try {
    const outName = `${job.i}.webp`; // use index as safe filename
    const outPath = join(OUT_IMAGES, outName);
    const buf = await sharp(job.buf)
      .resize(64, 64, { fit: 'cover' })
      .webp({ quality: 40 })
      .toBuffer();
    writeFileSync(outPath, buf);
    doneCount++;
    if (doneCount % 500 === 0) process.stdout.write(`  ${doneCount}/${imageJobs.length}  \n`);
    return `images/${outName}`;
  } catch {
    return null;
  }
}, CONCURRENCY);

// Assign thumbs back to parts
for (let k = 0; k < imageJobs.length; k++) {
  const { i } = imageJobs[k];
  allParts[i].thumb = results[k] || undefined;
  delete allParts[i]._imgAnchorRow;
  if (results[k]) totalImagesOutput++;
}

console.log(`  → ${totalImagesOutput} thumbnails written\n`);

// --- Dedupe + index ----------------------------------------------------
const unique = new Map(); // key = sku + '|' + model
for (const p of allParts) {
  const key = `${p.sku}|${p.model}`;
  if (!unique.has(key)) {
    unique.set(key, { ...p, regions: p.region ? [p.region] : [] });
  } else {
    const e = unique.get(key);
    if (p.region && !e.regions.includes(p.region)) e.regions.push(p.region);
    if (p.en && !e.en) e.en = p.en;
    if (p.zh && !e.zh) e.zh = p.zh;
    if (!e.thumb && p.thumb) e.thumb = p.thumb;
    if (!e.price && p.price) e.price = p.price;
  }
}
const finalParts = [...unique.values()].sort((a, b) => {
  const m = a.model.localeCompare(b.model);
  return m !== 0 ? m : a.sku.localeCompare(b.sku);
});

// Search indexes — precomputed lowercase strings
for (const p of finalParts) {
  p._en_lower = (p.en || '').toLowerCase();
  p._zh_lower = (p.zh || '').toLowerCase();
  p._model_lower = (p.model || '').toLowerCase();
  p._sku_lower = p.sku.toLowerCase();
}

// Drop internal anchors (keep thumbs)
for (const p of finalParts) delete p._imgAnchorRow;

// --- Write output ------------------------------------------------------
const data = {
  format: '2',
  builtAt: new Date().toISOString(),
  source: `${SRC_DIR} (${files.length} xlsx)`,
  imageSizes: { width: 64, height: 64, format: 'webp', quality: 40 },
  parts: finalParts,
};
writeFileSync(SKU_JSON, JSON.stringify(data));

const jsonKB = statSync(SKU_JSON).size / 1024;
const totalImgKB = statSync(OUT_IMAGES) ? 
  readdirSync(OUT_IMAGES).reduce((n, f) => n + statSync(join(OUT_IMAGES, f)).size, 0) / 1024 : 0;

const uniqueModels = [...modelRegistry].sort();
const meta = {
  filesProcessed: files.length,
  rowsExtracted: allParts.length,
  partsDeduped: finalParts.length,
  uniqueModels: uniqueModels.length,
  uniqueModelList: uniqueModels,
  workbookOrigMB: Math.round(totalOrigKB / 1024),
  outputJsonKB: Math.round(jsonKB),
  outputImagesKB: Math.round(totalImgKB),
  imagesMatchedInSources: totalImagesMatched,
  imagesThumbnailed: totalImagesOutput,
};
writeFileSync(META_JSON, JSON.stringify(meta, null, 2));

console.log(`═══ Summary ═══`);
console.log(`  Input:        ${files.length} xlsx, ${meta.workbookOrigMB} MB`);
console.log(`  Rows parsed:   ${allParts.length}`);
console.log(`  Unique parts:  ${finalParts.length} (sku × model)`);
console.log(`  Unique models: ${uniqueModels.length}`);
console.log(`  Images:        ${totalImagesMatched} matched → ${totalImagesOutput} thumbnails`);
console.log(`  JSON:          ${Math.round(jsonKB)} KB`);
console.log(`  Images:        ${Math.round(totalImgKB)} KB (64×64 WebP q40)`);
console.log(`  OUTPUT FOLDER: ${join(process.cwd(), OUT_DIR)}`);
console.log(`  TOTAL COMPRESSED: ${Math.round(jsonKB + totalImgKB)} KB vs ${meta.workbookOrigMB * 1024} KB input = ${(meta.workbookOrigMB * 1024 / (jsonKB + totalImgKB)).toFixed(0)}×`);

// Quick sanity check — sample parts
console.log(`\n─── Sample parts (first 5) ───`);
for (const p of finalParts.slice(0, 5)) {
  console.log(`  ${p.model.padEnd(28)} ${p.sku.padEnd(16)} ${(p.en || p.zh || '').slice(0, 40)} ${p.thumb ? '🖼' : ''}`);
}

// Top image sizes
if (totalImagesOutput > 0) {
  const allThumbs = readdirSync(OUT_IMAGES).map((f) => ({ f, kb: statSync(join(OUT_IMAGES, f)).size / 1024 }));
  allThumbs.sort((a, b) => b.kb - a.kb);
  console.log(`\n─── Largest thumbnails ───`);
  for (const t of allThumbs.slice(0, 3)) console.log(`  ${t.kb.toFixed(1)} KB  ${t.f}`);
}
