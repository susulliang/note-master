#!/usr/bin/env node
/**
 * build-faq-md.mjs
 *
 * Converts raw FAQ sheets (/FAQ/*.xlsx/*.xls/*.docx/*.pdf) into
 * structured Markdown files under /products/FAQ/*.
 *
 *  - Version-aware dedupe (by model slug): keeps the newest sheet per model
 *  - ASCII-slug output filenames: avoids Vite glob unicode/space path bug
 *  - Two output layouts:
 *      * FAQ Q&A   → each row → one MD file with frontmatter (model/lang/category)
 *      * Tables    → each sheet → one MD file with GFM table (compare products layout)
 *
 * Usage: node scripts/build-faq-md.mjs [--dry-run] [--max-files=20]
 */
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { join, basename, extname, relative, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import XLSX from 'xlsx';
import mammoth from 'mammoth';
const __require = createRequire(import.meta.url);
const pdfParse = __require('pdf-parse');

const __dirname = dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const ROOT = resolve(__dirname, '..');
const FAQ_SRC = join(ROOT, 'FAQ');
const OUT_DIR = join(ROOT, 'products', 'FAQ');

const DRY = process.argv.some((a) => a === '--dry-run');
const MAX_FILES = (() => {
  const m = process.argv.find((a) => a.startsWith('--max-files='));
  if (!m) return Infinity;
  return parseInt(m.split('=')[1], 10) || Infinity;
})();

// ------------------------- helpers -------------------------

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function slugify(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]+/g, '') // strip non-ASCII (we keep CJK content in bodies, not in filenames)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'item';
}

function digest16(str) {
  return createHash('sha1').update(str, 'utf8').digest('hex').slice(0, 6);
}

// Extract a double (1.0 / 2.6 / 260213 treated as date, not ver)
function extractVersion(name) {
  // Explicit "V 2.6" / "V2.0" / "Version 2"
  const mv = name.match(/V\s*(\d+(?:\.\d+){1,2})/i) || name.match(/Version\s*(\d+(?:\.\d+)?)/i);
  if (mv) return parseFloat(mv[1]);
  return 0;
}

// 20251231 / 20230214 / 25.12.31 / 2024.06.06 → comparable timestamp (best-effort, null if none)
function extractDateStamp(name) {
  const eightDigit = name.match(/(?:^|[^\d])(\d{8})(?:[^\d]|$)/);
  if (eightDigit && /^20\d{6}$/.test(eightDigit[1])) {
    const y = +eightDigit[1].slice(0, 4), m = +eightDigit[1].slice(4, 6), d = +eightDigit[1].slice(6, 8);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d).getTime();
  }
  const ymdDot = name.match(/(20\d{2}|\d{2})[._](\d{1,2})[._](\d{1,2})/);
  if (ymdDot) {
    let y = +ymdDot[1];
    if (y < 100) y += 2000;
    const m = +ymdDot[2], d = +ymdDot[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d).getTime();
  }
  return 0;
}

function detectCategory(fullpath) {
  const p = fullpath.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/faq/deebot')) return 'DEEBOT';
  if (p.includes('/faq/goat')) return 'GOAT';
  if (p.includes('/faq/winbot')) return 'WINBOT';
  if (p.includes('/faq/ultramarine')) return 'ULTRAMARINE';
  return 'OTHER';
}

// Model slug = product family key (for dedupe grouping). Aggressive:
// strip version/lang markers so "降配版海外中英" and "CN&EN" collapse to one model key.
function extractModelSlug(filename, category) {
  let n = basename(filename, extname(filename));
  n = n
    .replace(/V\s*\d+(?:\.\d+){0,2}/gi, '')
    .replace(/Version\s*\d+(?:\.\d+)?/gi, '')
    .replace(/\d{4}[._-]?\d{1,2}[._-]?\d{1,2}/g, '') // date stamps
    .replace(/\d{6,8}/g, '')
    .replace(/降配版|海外|中英|CN&?EN|\(US\)|中文版|English|EN版|多语言|multi-?language|19\s*langs|6\s*languages|用户侧|User\s*Side|终版|纯文字版|贝多芬|MIAODA|msm|fabe|GCC|\([^)]*\)|（[^）]*）|【[^】]*】|\[[^\]]*\]/g, ' ')
    .replace(/FAQ\s*(2\.0|1\.0|1\.5)?|Basic\s*data|机型功能对比|功能对比|机型|核心卖点|代号|区别|区别对比|Mapping|常见问题|FAQ\s*for|FAQ/gi, ' ')
    .replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim();
  // If nothing left (e.g. pure marker filename), use category as fallback bucket
  // so we still dedupe within category.
  return slugify(n) || slugify(category);
}

function detectLang(name) {
  const n = name.toLowerCase();
  let multi = 0, en = 0, cn = 0;
  if (/multi[- ]?language|19\s*langs|6\s*languages|13\s*langs|多语言/.test(n)) multi = 2;
  if (/\(us\)|en版|\(en\)|basic data|overseas|english|user side|hq support|faq for|a series|g series|gx-|o series|a\d{4}|o\d{3}/.test(n)) en = 1;
  if (/中文|中英|cn&en|中文版|中国|降配版|海外|机型|核心卖点|区别|对比|代号|故障|快查|系列/.test(name)) cn = 1;
  if (multi) return 'multi';
  if (cn && en) return 'bilingual';
  if (cn) return 'zh';
  if (en) return 'en';
  // fallback: check CJK chars present in filename itself
  return /[\u4e00-\u9fff]/.test(name) ? 'zh' : 'en';
}

// ------------------------- sheet content classifiers -------------------------

// Score each column in header row for "Question"-ness and "Answer"-ness.
const Q_KEYS = [/问题|question|q\s*\d*|query|faq.*item|标题|topic/i];
const A_KEYS = [/答案|answer|a\s*\d*|solution|resolution|解决|reply|处理|建议方案|detail|说明/i];
const MODEL_KEYS = [/机型|model|产品|product|series|sku|p\s*\/?\s*n/i];
const SPEC_KEYS = [/规格|spec|参数|param|功能|feature|对比|compare|基本信息|尺寸|weight|重量|battery|续航|capacity|noise|噪音|power|电压/i];

function classifySheet(headers, sampleRows) {
  let qScore = 0, aScore = 0, modelScore = 0, specScore = 0;
  for (const h of headers || []) {
    const s = String(h ?? '');
    if (Q_KEYS.some((r) => r.test(s))) qScore++;
    if (A_KEYS.some((r) => r.test(s))) aScore++;
    if (MODEL_KEYS.some((r) => r.test(s))) modelScore++;
    if (SPEC_KEYS.some((r) => r.test(s))) specScore++;
  }
  // Heuristic: comparison table = many columns with model+spec keywords and NO clear Q/A separation
  // Q&A sheet = Q and A columns both present
  if (qScore >= 1 && aScore >= 1) return { kind: 'qa', qScore, aScore };
  if (headers && headers.length >= 4 && modelScore + specScore >= 2) return { kind: 'table', modelScore, specScore };
  if (qScore >= 1 || aScore >= 1) return { kind: 'qa' }; // lenient
  // if 4+ cols, treat as table anyway (safer than dropping data)
  if (headers && headers.length >= 4) return { kind: 'table' };
  return { kind: 'qa' }; // fallback: render as question/answer pairs per row
}

function buildGfmTable(headers, rows) {
  const head = headers.map((h) => String(h ?? '').replace(/\|/g, '\\|').trim() || '—').join(' | ');
  const sep = headers.map(() => '---').join(' | ');
  const body = rows
    .map((r) => r.map((c) => String(c ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim() || '—').join(' | '))
    .join('\n');
  return `| ${head} |\n| ${sep} |\n| ${body} |\n`;
}

// ------------------------- per-format readers -------------------------

async function readWorkbook(file) {
  try {
    // cellText=false: formula results are calculated as strings but we also want values.
    return XLSX.readFile(file, { cellDates: true });
  } catch (e) {
    console.warn(`  [xlsx] 读失败 ${basename(file)}: ${e.message}`);
    return null;
  }
}

function sheetToAoa(ws) {
  // header=1 means array of arrays; defval='' so empty cells are '' not undefined
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
}

function writeMd(filename, content) {
  const p = join(OUT_DIR, filename);
  if (DRY) return console.log(`  DRY write ${filename} (${content.length} chars)`);
  writeFileSync(p, content, 'utf8');
  writtenCount++;
}

let writtenCount = 0;
let qaCount = 0;
let tableCount = 0;
let docCount = 0;
let skippedDupeCount = 0;

// ------------------------- main dedupe + dispatch -------------------------

async function main() {
  const allFiles = walk(FAQ_SRC).filter((p) => {
    const name = basename(p);
    if (name.startsWith('~$')) return false; // Office temp lock files → delete later
    const ext = extname(name).toLowerCase();
    return ['.xlsx', '.xls', '.docx', '.pdf'].includes(ext);
  });
  console.log(`[discover] FAQ 源文件候选：${allFiles.length} 个`);

  // Step 1: meta-map each file → dedupe
  const metas = allFiles.map((p) => {
    const st = statSync(p);
    const ext = extname(p).toLowerCase();
    return {
      path: p,
      ext,
      category: detectCategory(p),
      name: basename(p),
      size: st.size,
      mtime: st.mtimeMs,
      version: extractVersion(basename(p)),
      dateStamp: extractDateStamp(basename(p)),
      modelSlug: extractModelSlug(p, detectCategory(p)),
      lang: detectLang(basename(p)),
    };
  });

  // Group by (category + modelSlug)
  const groups = new Map();
  for (const m of metas) {
    const k = `${m.category}::${m.modelSlug}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  console.log(`[dedupe] ${groups.size} 个产品分组`);

  // Pick winners: higher version → larger date → larger size → newer mtime
  const winners = [];
  for (const [groupKey, arr] of groups.entries()) {
    if (arr.length === 1) {
      winners.push(arr[0]);
      continue;
    }
    arr.sort((a, b) => {
      if (b.version !== a.version) return b.version - a.version;
      if (b.dateStamp !== a.dateStamp) return b.dateStamp - a.dateStamp;
      if (b.size !== a.size) return b.size - a.size;
      return b.mtime - a.mtime;
    });
    const keep = arr[0];
    const drop = arr.slice(1);
    skippedDupeCount += drop.length;
    console.log(`  去重 ${groupKey} (${arr.length}份) → 保留: ${keep.name} (V${keep.version} / ${Math.round(keep.size / 1024)}KB); 跳过: ${drop.map((d) => d.name).join(' | ')}`);
    winners.push(keep);
  }
  console.log(`[dedupe] 保留 ${winners.length} 份（跳过 ${skippedDupeCount} 份重复）`);

  // Step 2: reset output dir
  if (!DRY) {
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
  } else {
    console.log(`[dry-run] 输出目录：${OUT_DIR}`);
  }

  // Step 3: process winners
  let fileIdx = 0;
  const limited = winners.slice(0, MAX_FILES);
  console.log(`[process] 处理 ${limited.length} 份文件${MAX_FILES < winners.length ? `（--max-files=${MAX_FILES} 限制）` : ''}…`);

  for (const meta of limited) {
    fileIdx++;
    const prefix = `(${fileIdx}/${limited.length}) [${meta.category}] ${meta.name}`;
    console.log(`\n▶ ${prefix}`);
    try {
      if (meta.ext === '.xlsx' || meta.ext === '.xls') {
        await processSheet(meta);
      } else if (meta.ext === '.docx') {
        await processDocx(meta);
      } else if (meta.ext === '.pdf') {
        await processPdf(meta);
      }
    } catch (err) {
      console.warn(`  ⚠ 处理失败：${err && err.stack ? err.stack : err}`);
    }
  }

  console.log('\n================ RESULT ================');
  console.log(`  QA 条目 MD:    ${qaCount}`);
  console.log(`  对比表 MD:     ${tableCount}`);
  console.log(`  文档 MD:       ${docCount}`);
  console.log(`  TOTAL 写入:    ${writtenCount}`);
  console.log('========================================');

  // Step 4: clean Office temp lock files (~$...) inside FAQ_SRC (and subdirs)
  if (!DRY) {
    const lockFiles = walk(FAQ_SRC).filter((p) => basename(p).startsWith('~$'));
    for (const lf of lockFiles) {
      try {
        unlinkSync(lf);
        console.log(`  [cleanup] deleted lock: ${relative(ROOT, lf)}`);
      } catch (e) {
        console.warn(`  [cleanup] 无法删除 ${lf}: ${e.message}`);
      }
    }
  }
}

// ------------------------- per-type processors -------------------------

const sheetFileCounter = new Map();

function nextFileNum(baseKey) {
  const n = (sheetFileCounter.get(baseKey) ?? 0) + 1;
  sheetFileCounter.set(baseKey, n);
  return n;
}

async function processSheet(meta) {
  const wb = await readWorkbook(meta.path);
  if (!wb) return;
  const baseKey = `${meta.category}_${meta.modelSlug || meta.lang}`;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = sheetToAoa(ws);
    if (aoa.length < 2) continue; // need at least header + 1 data row

    // Robust header detection: first non-empty row that has ≥2 non-empty cells
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(5, aoa.length); i++) {
      const nonEmpty = aoa[i].filter((c) => String(c ?? '').trim().length > 0).length;
      if (nonEmpty >= 2) { headerRowIdx = i; break; }
    }
    const headers = aoa[headerRowIdx].map((c) => String(c ?? '').trim());
    const rows = aoa.slice(headerRowIdx + 1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0));
    if (rows.length === 0) continue;

    const sampleRows = rows.slice(0, 3);
    const cls = classifySheet(headers, sampleRows);

    if (cls.kind === 'qa') {
      writeQaRows(headers, rows, meta, sheetName);
    } else {
      writeComparisonTable(headers, rows, meta, sheetName);
    }
  }
}

function writeQaRows(headers, rows, meta, sheetName) {
  // Identify Q/A columns by header score
  let qIdx = -1, aIdx = -1, multiQIdx = [], multiAIdx = [];
  headers.forEach((h, i) => {
    const s = String(h ?? '');
    const isQ = Q_KEYS.some((r) => r.test(s));
    const isA = A_KEYS.some((r) => r.test(s));
    if (isQ && !isA) { qIdx = i; multiQIdx.push(i); }
    if (isA && !isQ) { aIdx = i; multiAIdx.push(i); }
    if (isQ && isA) { // ambiguous → both
      multiQIdx.push(i);
      multiAIdx.push(i);
    }
  });
  // Fallbacks: no explicit headers → assume col 0 = Q, col 1 = A
  if (qIdx === -1) qIdx = 0;
  if (aIdx === -1) aIdx = Math.min(1, headers.length - 1);
  if (multiQIdx.length === 0) multiQIdx = [qIdx];
  if (multiAIdx.length === 0) multiAIdx = [aIdx];

  const sectionSlug = slugify(sheetName);
  const fileKey = `${meta.category}_${meta.modelSlug}_${sectionSlug || 'sheet'}`;

  for (const row of rows) {
    const question = multiQIdx.map((i) => String(row[i] ?? '').trim()).filter(Boolean).join(' / ').trim();
    const answer = multiAIdx.map((i) => String(row[i] ?? '').trim()).filter(Boolean).join('\n\n').trim();
    if (!question && !answer) continue;

    const num = nextFileNum(fileKey);
    const safeQ = question.replace(/[#*`_~]/g, '').slice(0, 80);
    const id = digest16(`${fileKey}::${num}::${safeQ}::${answer.slice(0, 60)}`);
    // Filename: 0200_DEEBOT_T50_降配版_zh_d9a31f.md — counter then readable slug then digest
    const counter = String(writtenCount + 1).padStart(4, '0');
    const fn = `${counter}_${slugify(meta.category)}_${slugify(meta.modelSlug)}_${slugify(meta.lang)}_${id}.md`;

    const title = question || `FAQ ${sheetName} #${num}`;
    const body = `---
category: ${meta.category}
model: ${basename(meta.name, extname(meta.name)).replace(/^[【\[(]|[】\])]s*$/g, '').slice(0, 120)}
model_slug: ${meta.modelSlug}
lang: ${meta.lang}
source: ${relative(ROOT, meta.path).replace(/\\/g, '/')}
source_sheet: ${sheetName}
kind: faq
version: ${meta.version || 1.0}
---

# ${escapeMd(title)}

${meta.category !== 'OTHER' ? `> **产品线**: ${meta.category}  **语言**: ${meta.lang}\n>\n` : ''}
## 问题 / Question

${question ? escapeMd(question) : '—'}

## 答案 / Answer

${answer ? escapeMd(answer) : '—'}
`;
    writeMd(fn, body);
    qaCount++;
  }
}

function writeComparisonTable(headers, rows, meta, sheetName) {
  const counter = String(writtenCount + 1).padStart(4, '0');
  const sectionSlug = slugify(sheetName || 'comparison');
  const id = digest16(`${meta.category}::${meta.modelSlug}::${headers.join(',')}::${JSON.stringify(rows.slice(0, 2))}`);
  const fn = `${counter}_${slugify(meta.category)}_${slugify(meta.modelSlug)}_tbl_${sectionSlug}_${id}.md`;
  const title = `${meta.category} · ${sheetName ? sheetName + ' · ' : ''}规格对比表`;
  const md = `---
category: ${meta.category}
model: ${basename(meta.name, extname(meta.name)).slice(0, 120)}
model_slug: ${meta.modelSlug}
lang: ${meta.lang}
source: ${relative(ROOT, meta.path).replace(/\\/g, '/')}
source_sheet: ${sheetName}
kind: comparison-table
---

# ${escapeMd(title)}

> 来源：${relative(ROOT, meta.path).replace(/\\/g, '/')} ｜ Sheet: ${sheetName}

### ${escapeMd(sheetName || 'Comparison')}

${buildGfmTable(headers, rows)}
`;
  writeMd(fn, md);
  tableCount++;
}

async function processDocx(meta) {
  try {
    const buf = readFileSync(meta.path);
    const res = await mammoth.convertToMarkdown({ buffer: buf });
    const rawMd = (res.value || '').trim();
    if (!rawMd) return;
    const counter = String(writtenCount + 1).padStart(4, '0');
    const id = digest16(rawMd.slice(0, 200));
    const fn = `${counter}_${slugify(meta.category)}_${slugify(meta.modelSlug)}_doc_${slugify(meta.lang)}_${id}.md`;
    let title = basename(meta.name, extname(meta.name));
    const h1m = rawMd.match(/^#\s+(.+)$/m);
    if (h1m) title = h1m[1].trim();
    const head = `---
category: ${meta.category}
model: ${basename(meta.name, extname(meta.name)).slice(0, 120)}
model_slug: ${meta.modelSlug}
lang: ${meta.lang}
source: ${relative(ROOT, meta.path).replace(/\\/g, '/')}
kind: faq-doc
---

`;
    const finalBody = rawMd.startsWith('#') ? rawMd : `# ${escapeMd(title)}\n\n${rawMd}`;
    writeMd(fn, head + finalBody + '\n');
    docCount++;
  } catch (e) {
    console.warn(`  [docx] 失败: ${e.message}`);
  }
}

async function processPdf(meta) {
  try {
    const buf = readFileSync(meta.path);
    const data = await pdfParse(buf);
    const text = (data.text || '').trim();
    if (!text) return;
    // Split PDF text into rough sections at empty lines; use ## headings for paragraph breaks
    const paragraphs = text
      .replace(/\r\n/g, '\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 200); // cap huge PDFs
    const body = paragraphs.map((para, i) => (i === 0 ? `# ${escapeMd(para.slice(0, 120))}` : `## 段落 ${i + 1}\n\n${escapeMd(para)}`)).join('\n\n');
    const counter = String(writtenCount + 1).padStart(4, '0');
    const id = digest16(text.slice(0, 200));
    const fn = `${counter}_${slugify(meta.category)}_${slugify(meta.modelSlug)}_pdf_${slugify(meta.lang)}_${id}.md`;
    const head = `---
category: ${meta.category}
model: ${basename(meta.name, extname(meta.name)).slice(0, 120)}
model_slug: ${meta.modelSlug}
lang: ${meta.lang}
source: ${relative(ROOT, meta.path).replace(/\\/g, '/')}
kind: faq-pdf
---

`;
    writeMd(fn, head + body + '\n');
    docCount++;
  } catch (e) {
    console.warn(`  [pdf] 失败: ${e.message}`);
  }
}

function escapeMd(s) {
  return String(s ?? '')
    .replace(/</g, '＜')
    .replace(/>/g, '＞')
    .replace(/\r?\n{3,}/g, '\n\n');
}

// run
await main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
