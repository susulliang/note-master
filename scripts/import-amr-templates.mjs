#!/usr/bin/env node
/**
 * import-amr-templates.mjs — import the Salesforce EmailTemplate export
 * (AMR_Templates/Templates_export.csv) into the eco-data D1 database.
 *
 * CSV columns: _, Id, FolderName, Name, Description, Subject, HtmlValue,
 *              CreatedBy.Name, CreatedBy.UserRole.Name
 * HtmlValue spans multiple quoted lines, so a full quoted-CSV parser is
 * used (not naive line splitting).
 *
 * Output: AMR_Templates/import.sql — one UPSERT per template.
 * Apply with:
 *   npx wrangler d1 execute eco-data --remote --file AMR_Templates/import.sql -y
 *
 * Reuse: drop in a fresh Templates_export.csv and re-run; ids are stable
 * Salesforce record ids, so rows upsert rather than duplicate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = resolve(ROOT, 'AMR_Templates', 'Templates_export.csv');
const SQL_PATH = resolve(ROOT, 'AMR_Templates', 'import.sql');

/* ---------------- quoted, multiline CSV parser ---------------- */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

/* --------------------------- main ----------------------------- */

const text = readFileSync(CSV_PATH, 'utf8');
const rows = parseCsv(text);
const header = rows[0];
const col = {};
['Id', 'FolderName', 'Name', 'Description', 'Subject', 'HtmlValue', 'CreatedBy.Name']
  .forEach((name) => { col[name] = header.indexOf(name); });

const templates = [];
for (const r of rows.slice(1)) {
  const id = (r[col.Id] ?? '').trim();
  if (!/^00X/.test(id)) continue; // data rows only (salesforce email templates)
  templates.push({
    id,
    folder: (r[col.FolderName] ?? '').trim(),
    name: (r[col.Name] ?? '').trim(),
    description: (r[col.Description] ?? '').trim(),
    subject: (r[col.Subject] ?? '').trim(),
    html: r[col.HtmlValue] ?? '',
    author: (r[col['CreatedBy.Name']] ?? '').trim(),
  });
}

/** Escape a value as a single-quoted SQLite string literal. */
const lit = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;

const statements = [
  `CREATE TABLE IF NOT EXISTS amr_templates (
  id TEXT PRIMARY KEY,
  folder TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);`,
  ...templates.map((t) =>
    `INSERT INTO amr_templates (id, folder, name, description, subject, html, author, updated_at)
VALUES (${lit(t.id)}, ${lit(t.folder)}, ${lit(t.name)}, ${lit(t.description)}, ${lit(t.subject)}, ${lit(t.html)}, ${lit(t.author)}, ${Date.now()})
ON CONFLICT(id) DO UPDATE SET
  folder = excluded.folder, name = excluded.name, description = excluded.description,
  subject = excluded.subject, html = excluded.html, author = excluded.author,
  updated_at = excluded.updated_at;`
  ),
];

writeFileSync(SQL_PATH, `${statements.join('\n')}\n`, 'utf8');

const folders = {};
for (const t of templates) folders[t.folder] = (folders[t.folder] ?? 0) + 1;
console.log(`Parsed ${templates.length} templates across ${Object.keys(folders).length} folders:`);
for (const [folder, n] of Object.entries(folders)) console.log(`  ${folder}: ${n}`);
console.log(`Wrote ${SQL_PATH} (${statements.length} statements).`);
console.log('Apply with: npx wrangler d1 execute eco-data --remote --file AMR_Templates/import.sql -y');
