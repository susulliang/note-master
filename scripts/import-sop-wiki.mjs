#!/usr/bin/env node
/**
 * import-sop-wiki.mjs — migrate the SOP handbook from the Feishu wiki
 * (https://lmgx8md8u1.feishu.cn/wiki/VeKqwnu57iEJimkLYX2caEqoneh) into the
 * eco-data D1 database, mirroring the AMR templates migration.
 *
 * Input : SOP/wiki-sop-source.md — the wiki fetched as markdown via
 *         `lark-cli docs +fetch --as user --doc <wiki-url> --doc-format markdown`
 * Model : one row per heading section (any level 1-6), with the SAME
 *         deterministic ids the app's sopIndexer computes (`h{level}-{counter}`),
 *         so a re-import upserts in place and the panel can reassemble the
 *         raw markdown byte-for-byte and keep using indexSopMarkdown.
 * Output: SOP/sop-import.sql — one UPSERT per section.
 * Apply with:
 *   npx wrangler d1 execute eco-data --remote --file SOP/sop-import.sql -y
 *
 * Reuse: re-fetch the wiki to the source file and re-run; unchanged
 * sections upsert with fresh timestamps.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'SOP', 'wiki-sop-source.md');
const SQL_PATH = resolve(ROOT, 'SOP', 'sop-import.sql');

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/** Parse markdown into flat sections with the indexer's id scheme.
 *  body holds ONLY this section's own lines (nested headings are separate
 *  rows); reassembly + indexSopMarkdown rebuild the ancestor duplication. */
function parseSections(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  const levelStack = [0, 0, 0, 0, 0, 0].map(() => -1);
  let counter = 0;

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      const level = m[1].length;
      for (let l = 6; l >= level; l -= 1) levelStack[l - 1] = -1;
      let parentIdx = -1;
      for (let l = level - 1; l >= 1; l -= 1) {
        if (levelStack[l - 1] !== -1) { parentIdx = levelStack[l - 1]; break; }
      }
      const idx = sections.length;
      const id = `h${level}-${counter}`;
      const parentId = parentIdx === -1 ? null : sections[parentIdx].id;
      const title = m[2].replace(/\\([!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-])/g, '$1').trim();
      sections.push({ id, level, title, body: [], parentId, sortOrder: counter });
      levelStack[level - 1] = idx;
      counter += 1;
    } else if (sections.length > 0) {
      sections[sections.length - 1].body.push(line);
    }
  }
  for (const s of sections) {
    s.body = s.body.join('\n').replace(/\n+$/, '');
  }
  return sections;
}

const raw = readFileSync(SRC, 'utf8');
const sections = parseSections(raw);

const lit = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
const now = Date.now();

const statements = [
  `CREATE TABLE IF NOT EXISTS sop_entries (
  id TEXT PRIMARY KEY,
  level INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  sort_order INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);`,
  ...sections.map(
    (s) =>
      `INSERT INTO sop_entries (id, level, title, body, parent_id, sort_order, updated_at)
VALUES (${lit(s.id)}, ${s.level}, ${lit(s.title)}, ${lit(s.body)}, ${s.parentId ? lit(s.parentId) : 'NULL'}, ${s.sortOrder}, ${now})
ON CONFLICT(id) DO UPDATE SET
  level = excluded.level, title = excluded.title, body = excluded.body,
  parent_id = excluded.parent_id, sort_order = excluded.sort_order,
  updated_at = excluded.updated_at;`
  ),
];

writeFileSync(SQL_PATH, `${statements.join('\n')}\n`, 'utf8');

const byLevel = {};
for (const s of sections) byLevel[s.level] = (byLevel[s.level] ?? 0) + 1;
console.log(`Parsed ${sections.length} sections:`, JSON.stringify(byLevel));
console.log(`Wrote ${SQL_PATH} (${statements.length} statements).`);
console.log('Apply with: npx wrangler d1 execute eco-data --remote --file SOP/sop-import.sql -y');
