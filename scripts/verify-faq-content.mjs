#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FAQ_DIR = join(ROOT, 'products', 'FAQ');
const CONTENT_DIR = join(ROOT, 'public', 'faq-content');
const BUILD_REPORT = join(ROOT, 'logs', 'faq-build-report.json');
const W3_SOURCE = 'FAQ/WINBOT/W3 OMNI/【FAQ 2.0】WINBOT W3 OMNI - V260213.xlsx';
const failures = [];

function readFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const values = {};
  if (!match) return { values, body: markdown };
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    try {
      values[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
    } catch {
      values[key] = raw.replace(/^['"]|['"]$/g, '');
    }
  }
  return { values, body: markdown.slice(match[0].length) };
}

function section(body, heading) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^##\\s*${heading}\\s*$`, 'i').test(line.trim()));
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function fail(message) {
  failures.push(message);
}

if (!existsSync(join(CONTENT_DIR, 'index.json'))) {
  throw new Error('public/faq-content/index.json is missing; build the FAQ content first.');
}

const markdownDocs = new Map();
for (const path of walk(FAQ_DIR)) {
  const { values, body } = readFrontmatter(readFileSync(path, 'utf8'));
  if (values.kind !== 'faq') continue;
  const lang = String(values.lang ?? '').toLowerCase();
  if (!['en', 'zh'].includes(lang)) fail(`${basename(path)} has unsupported language "${lang}".`);
  if (!section(body, 'Question') || !section(body, 'Answer')) fail(`${basename(path)} is missing Q&A content.`);
  markdownDocs.set(basename(path, '.md'), { values, body });
}

const payload = JSON.parse(readFileSync(join(CONTENT_DIR, 'index.json'), 'utf8'));
const entries = payload.entries ?? [];
if (!existsSync(BUILD_REPORT)) fail('FAQ parser report is missing.');
else {
  const report = JSON.parse(readFileSync(BUILD_REPORT, 'utf8'));
  if (report.faqRecordsWritten !== markdownDocs.size) {
    fail(`parser emitted ${report.faqRecordsWritten} FAQ records but found ${markdownDocs.size} FAQ Markdown files.`);
  }
}
const seenIds = new Set();
const shardCache = new Map();
for (const entry of entries) {
  if (!['en', 'zh'].includes(entry.lang)) fail(`${entry.id} has unsupported index language "${entry.lang}".`);
  if (!entry.title?.includes(entry.lang.toUpperCase())) fail(`${entry.id} has no language marker in its title.`);
  if (entry.model && !entry.title.includes(entry.model)) fail(`${entry.id} model is missing from its title.`);
  if (seenIds.has(entry.id)) fail(`duplicate FAQ id ${entry.id}.`);
  seenIds.add(entry.id);
  const document = markdownDocs.get(entry.id);
  if (!document) {
    fail(`index entry ${entry.id} has no source Markdown.`);
    continue;
  }
  if (entry.lang !== document.values.lang) fail(`${entry.id} language differs between Markdown and index.`);
  if (!entry.source || !/\.(xlsx|xls)$/i.test(entry.source)) fail(`${entry.id} does not identify an Excel source.`);
  if (!existsSync(join(ROOT, entry.source))) fail(`${entry.id} references missing source ${entry.source}.`);
  if (!shardCache.has(entry.shard)) {
    const shardPath = join(CONTENT_DIR, entry.shard);
    shardCache.set(entry.shard, existsSync(shardPath) ? JSON.parse(readFileSync(shardPath, 'utf8')) : null);
  }
  const shard = shardCache.get(entry.shard);
  if (!shard?.[entry.id]?.answer?.trim()) fail(`${entry.id} has no answer in ${entry.shard}.`);
}

for (const id of markdownDocs.keys()) {
  if (!seenIds.has(id)) fail(`FAQ Markdown ${id} is missing from index.json.`);
}

const w3Entries = entries.filter((entry) => entry.source === W3_SOURCE);
const w3Languages = new Set(w3Entries.map((entry) => entry.lang));
const w3Workbook = XLSX.readFile(join(ROOT, W3_SOURCE));
const w3Expected = ['英文', '中文'].reduce((total, sheet) => {
  const rows = XLSX.utils.sheet_to_json(w3Workbook.Sheets[sheet], {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });
  return total + rows.slice(1).filter((row) => String(row[1] ?? '').trim() && String(row[2] ?? '').trim()).length;
}, 0);
if (w3Entries.length !== w3Expected) {
  fail(`latest W3 workbook has ${w3Expected} EN/ZH Q&As but the index has ${w3Entries.length}.`);
}
if (!w3Languages.has('en') || !w3Languages.has('zh')) fail('latest W3 workbook is missing EN or ZH index entries.');
if (w3Entries.some((entry) => entry.modelSlug !== 'winbot_w3_omni')) {
  fail('latest W3 workbook entries are not assigned to the WINBOT W3 OMNI model.');
}

console.log(JSON.stringify({
  markdownFaqs: markdownDocs.size,
  indexEntries: entries.length,
  languages: [...new Set(entries.map((entry) => entry.lang))].sort(),
  shards: shardCache.size,
  latestW3Expected: w3Expected,
  latestW3Indexed: w3Entries.length,
}, null, 2));

if (failures.length) {
  for (const message of failures.slice(0, 80)) console.error(`FAIL ${message}`);
  console.error(`${failures.length} FAQ validation errors.`);
  process.exit(1);
}

console.log('FAQ content validation passed.');
