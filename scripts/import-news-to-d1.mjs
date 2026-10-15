#!/usr/bin/env node
/**
 * import-news-to-d1.mjs — migrate the News & Updates knowledge base
 * (news/*.md, curated from the Feishu 知识点分享群) into the eco-data D1
 * database, mirroring the SOP handbook migration.
 *
 * Model : one row per news file — id = filename slug (YYYY-MM-DD-slug),
 *         date from the prefix, title from the English H1, author from the
 *         `> Source:` line, body = everything after the title line
 *         (source line kept in body — the tab re-renders it as-is).
 * Output: news/news-import.sql — one UPSERT per entry.
 * Apply with:
 *   npx wrangler d1 execute eco-data --remote --file news/news-import.sql -y
 *
 * Reuse: new drops go through the same parse → SQL → wrangler pipeline;
 * after migration the D1 pool is the single source of truth and admins
 * add/edit/delete entries in-app.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEWS_DIR = resolve(ROOT, 'news');
const SQL_PATH = resolve(ROOT, 'news', 'news-import.sql');

const files = readdirSync(NEWS_DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f))
  .sort();

const entries = [];
for (const file of files) {
  const id = basename(file, '.md');
  const raw = readFileSync(resolve(NEWS_DIR, file), 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = (titleLine ?? id).replace(/^#\s+/, '').trim();
  const sourceLine = lines.find((l) => l.startsWith('> Source:'));
  const author = sourceLine ? (sourceLine.split('·').map((s) => s.trim())[1] ?? '') : '';
  const titleIdx = lines.findIndex((l) => l === titleLine);
  const body = (titleIdx >= 0 ? lines.slice(titleIdx + 1) : lines).join('\n').replace(/\n+$/, '');
  entries.push({ id, date: id.slice(0, 10), title, author, body });
}

const lit = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
const now = Date.now();

const statements = [
  `CREATE TABLE IF NOT EXISTS news_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);`,
  ...entries.map(
    (e) =>
      `INSERT INTO news_entries (id, date, title, author, body, updated_at)
VALUES (${lit(e.id)}, ${lit(e.date)}, ${lit(e.title)}, ${lit(e.author)}, ${lit(e.body)}, ${now})
ON CONFLICT(id) DO UPDATE SET
  date = excluded.date, title = excluded.title, author = excluded.author,
  body = excluded.body, updated_at = excluded.updated_at;`
  ),
];

writeFileSync(SQL_PATH, `${statements.join('\n')}\n`, 'utf8');
console.log(`Imported ${entries.length} news entries → ${SQL_PATH}`);
console.log('Apply with: npx wrangler d1 execute eco-data --remote --file news/news-import.sql -y');
