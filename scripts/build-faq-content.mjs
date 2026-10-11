#!/usr/bin/env node
import { readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_DIR = join(ROOT, 'products', 'FAQ');
const OUT_DIR = join(ROOT, 'public', 'faq-content');

function digest(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

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

function compactSearchTerms(question, answer) {
  const words = `${question}\n${answer}`
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = words.flatMap((word) => {
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word)) {
      return word.length >= 2 ? [word] : [];
    }
    const chars = Array.from(word);
    if (chars.length < 2) return chars;
    return chars.slice(0, -1).map((char, index) => char + (chars[index + 1] ?? ''));
  });
  return [...new Set(tokens)].slice(0, 40).join(' ');
}

function walkMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdown(filePath);
    return entry.isFile() && entry.name.endsWith('.md') ? [filePath] : [];
  });
}

const entries = [];
const shards = new Map();

for (const filePath of walkMarkdown(SOURCE_DIR)) {
  const markdown = readFileSync(filePath, 'utf8');
  const { values, body } = readFrontmatter(markdown);
  if (values.kind !== 'faq') continue;

  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  const question = section(body, 'Question') || title;
  const answer = section(body, 'Answer');
  if (!title || !question || !answer) continue;

  const id = basename(filePath, '.md');
  const category = String(values.category ?? 'OTHER');
  const model = String(values.model ?? '');
  const modelSlug = String(values.model_slug ?? 'general');
  const lang = String(values.lang ?? 'en').toLowerCase();
  const shardKey = `${category}:${modelSlug}:${lang}`;
  const shard = `faq-${digest(shardKey)}.json`;

  const entry = {
    id,
    category,
    model,
    modelSlug,
    lang,
    source: String(values.source ?? ''),
    sourceSheet: String(values.source_sheet ?? ''),
    question,
    searchText: compactSearchTerms(question, answer),
    version: Number.parseFloat(values.version) || 1,
    shard,
  };
  entries.push(entry);
  if (!shards.has(shard)) shards.set(shard, {});
  shards.get(shard)[id] = { answer };
}

entries.sort((a, b) =>
  a.category.localeCompare(b.category) ||
  a.modelSlug.localeCompare(b.modelSlug) ||
  a.lang.localeCompare(b.lang) ||
  a.question.localeCompare(b.question)
);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({ version: 1, entries }));
for (const [filename, content] of shards) {
  writeFileSync(join(OUT_DIR, filename), JSON.stringify(content));
}

const indexBytes = statSync(join(OUT_DIR, 'index.json')).size;
console.log(
  `[faq-content] ${entries.length} entries, ${shards.size} content shards; ` +
  `index ${(indexBytes / 1024).toFixed(0)} KB`
);
