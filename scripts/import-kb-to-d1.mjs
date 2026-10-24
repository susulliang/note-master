#!/usr/bin/env node
/**
 * One-time migration: import every prepackaged knowledge-base document into
 * the D1 `eco-data` database as the first line of truth.
 *
 * Sources (all stay bundled as client fallback):
 *   products/*.md            → kind 'product'          (SPECS / Error Codes /
 *                               Scientist / Pitch / GBU sheets / reference)
 *   products/FAQ/*.md        → kind 'faq'              (4400+ FAQ documents)
 *   software_updates/*.md    → kind 'firmware_update'  (files 01..03)
 *                              kind 'app_update'       (file 04, matches the
 *                               client parser's /^04_/ rule)
 *   src/data/gbuModels.ts    → kind 'gbu', id 'barcode-map' (GFM table)
 *
 * SQL encoding notes:
 *   • D1's import splits files on ';' WITHOUT parsing string literals, so
 *     every text value is embedded as a hex blob literal (CAST(X'..' AS
 *     TEXT)) — hex can never contain a splitter trigger.
 *   • D1 caps a single SQL statement at 100KB, so bodies whose hex form
 *     exceeds one chunk are inserted in pieces: DELETE (replace semantics),
 *     INSERT with the first chunk, then UPDATE ... body = body || appends.
 *
 * Existing small rows are NOT overwritten (admin edits win); oversized docs
 * (> 40KB) are replaced on re-run. Pass --force to replace every doc.
 *
 * Usage:
 *   node scripts/import-kb-to-d1.mjs [--remote] [--local] [--force]
 * (exactly one of --remote / --local; default --remote)
 */
import { readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_DIR = join(ROOT, '.wrangler', 'tmp-kb');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const faqOnly = args.has('--faq-only');
const pruneFaq = args.has('--prune-faq');
const dryRun = args.has('--dry-run');
const target = args.has('--local') ? 'local' : 'remote';
const DATABASE = 'eco-data';
if (pruneFaq && (!faqOnly || !force)) {
  throw new Error('--prune-faq requires both --faq-only and --force.');
}

const HEX_CHUNK = 80_000; // hex chars per statement ≈ 40KB utf-8 (< D1 100KB cap)
const hex = (s) => Buffer.from(String(s), 'utf8').toString('hex');
const castHex = (h) => `CAST(X'${h}' AS TEXT)`;

function readTitle(markdown, stem) {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? body.match(/^##\s+(.+)$/m)?.[1]?.trim() ?? stem;
}

const docs = [];

// 1. Product reference sheets (numbered 01..NN)
for (const name of readdirSync(join(ROOT, 'products'))) {
  if (!name.endsWith('.md') || name === 'README.md') continue;
  const raw = readFileSync(join(ROOT, 'products', name), 'utf8');
  const stem = basename(name, extname(name));
  docs.push({ kind: 'product', id: stem, title: readTitle(raw, stem), body: raw });
}

// 2. FAQ documents
const faqDir = join(ROOT, 'products', 'FAQ');
const faqWalk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return faqWalk(full);
    return entry.isFile() && entry.name.endsWith('.md') ? [full] : [];
  });
for (const file of faqWalk(faqDir)) {
  const raw = readFileSync(file, 'utf8');
  const stem = basename(file, extname(file));
  docs.push({ kind: 'faq', id: stem, title: readTitle(raw, stem), body: raw });
}

// 3. Software updates (kind decided by the client parser's /^04_/ rule)
for (const name of readdirSync(join(ROOT, 'software_updates'))) {
  if (!name.endsWith('.md')) continue;
  const raw = readFileSync(join(ROOT, 'software_updates', name), 'utf8');
  const stem = basename(name, extname(name));
  docs.push({ kind: /^04_/.test(name) ? 'app_update' : 'firmware_update', id: stem, title: readTitle(raw, stem), body: raw });
}

// 4. GBU barcode map from the bundled TS data (kind 'gbu', id 'barcode-map')
{
  const ts = readFileSync(join(ROOT, 'src', 'data', 'gbuModels.ts'), 'utf8');
  const rows = [...ts.matchAll(/\{\s*internal:\s*'([^']*)'\s*,\s*marketing:\s*'([^']*)'\s*\}/g)].map(
    (m) => `| ${m[1]} | ${m[2]} |`
  );
  const body = [
    '# GBU (North America) barcode map',
    '',
    'Model # (internal code) → Marketing name. Source: Feishu "史上最全GBU (北美)" → "Barcode" tab.',
    '',
    '| Internal | Marketing |',
    '| --- | --- |',
    ...rows,
  ].join('\n');
  docs.push({ kind: 'gbu', id: 'barcode-map', title: 'GBU Barcode Map', body });
}

// 4b. App Photos index (kind 'app_photo', id 'index') — the whole index.json
//     as one editable document; photo binaries stay bundled static assets.
{
  const raw = readFileSync(join(ROOT, 'public', 'app-photos', 'index.json'), 'utf8');
  docs.push({ kind: 'app_photo', id: 'index', title: 'App Photos Index', body: raw });
}

if (faqOnly) {
  for (let i = docs.length - 1; i >= 0; i--) {
    if (docs[i].kind !== 'faq') docs.splice(i, 1);
  }
  if (docs.length === 0) throw new Error('No FAQ markdown documents were found; refusing FAQ-only import.');
}

console.log(`[kb-import] ${docs.length} documents (${docs.filter((d) => d.kind === 'faq').length} faq)`);

// 5. Emit statements (hex-encoded, chunked for the 100KB statement cap)
const statements = [];
const faqSyncRunId = `${Date.now()}-${process.pid}`;
if (pruneFaq) {
  statements.push(
    `CREATE TABLE IF NOT EXISTS kb_faq_import_ids (run_id TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (run_id, id));`
  );
  for (const doc of docs) {
    statements.push(
      `INSERT OR IGNORE INTO kb_faq_import_ids (run_id, id) VALUES (${castHex(hex(faqSyncRunId))}, ${castHex(hex(doc.id))});`
    );
  }
}

for (const doc of docs) {
  const k = hex(doc.kind);
  const i = hex(doc.id);
  const where = `WHERE kind=${castHex(k)} AND id=${castHex(i)}`;
  const bh = hex(doc.body);
  const small = bh.length <= HEX_CHUNK;
  if (small && !force) {
    statements.push(
      `INSERT OR IGNORE INTO kb_documents (kind,id,title,body,updated_by,updated_at) VALUES (${castHex(k)}, ${castHex(i)}, ${castHex(hex(doc.title))}, ${castHex(bh)}, 'kb-import', datetime('now'));`
    );
  } else {
    // Oversized doc (or --force): replace, insert first chunk, append rest.
    statements.push(`DELETE FROM kb_documents ${where};`);
    statements.push(
      `INSERT INTO kb_documents (kind,id,title,body,updated_by,updated_at) VALUES (${castHex(k)}, ${castHex(i)}, ${castHex(hex(doc.title))}, ${castHex(bh.slice(0, HEX_CHUNK))}, 'kb-import', datetime('now'));`
    );
    for (let off = HEX_CHUNK; off < bh.length; off += HEX_CHUNK) {
      statements.push(`UPDATE kb_documents SET body = body || ${castHex(bh.slice(off, off + HEX_CHUNK))} ${where};`);
    }
  }
}
if (pruneFaq) {
  statements.push(
    `DELETE FROM kb_documents WHERE kind='faq' AND NOT EXISTS (` +
    `SELECT 1 FROM kb_faq_import_ids WHERE run_id=${castHex(hex(faqSyncRunId))} ` +
    `AND id=kb_documents.id);`
  );
  statements.push(`DELETE FROM kb_deletions WHERE kind='faq';`);
  statements.push(`DELETE FROM kb_faq_import_ids WHERE run_id=${castHex(hex(faqSyncRunId))};`);
}

// 6. Group statements into batch files and execute via wrangler
const chunks = [];
let current = [];
let currentBytes = 0;
for (const stmt of statements) {
  current.push(stmt);
  currentBytes += stmt.length;
  if (currentBytes > 800_000) {
    chunks.push(current);
    current = [];
    currentBytes = 0;
  }
}
if (current.length) chunks.push(current);

if (dryRun) {
  console.log(`[kb-import] dry run: ${statements.length} statements in ${chunks.length} SQL batches; no database changes made.`);
  process.exit(0);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

console.log(`[kb-import] ${statements.length} statements in ${chunks.length} SQL batches → ${OUT_DIR}`);
for (let i = 0; i < chunks.length; i++) {
  const file = join(OUT_DIR, `kb-batch-${String(i).padStart(3, '0')}.sql`);
  writeFileSync(file, chunks[i].join('\n'), 'utf8');
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', DATABASE, `--${target}`, '--yes', `--file=${file}`], {
    cwd: ROOT,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`[kb-import] batch ${i} FAILED`);
    process.exit(1);
  }
  console.log(`[kb-import] batch ${i + 1}/${chunks.length} ok (${chunks[i].length} stmts)`);
}
console.log(`[kb-import] done — ${docs.length} documents imported into D1 (${target}).`);
