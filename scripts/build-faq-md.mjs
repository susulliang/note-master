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
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, renameSync } from 'node:fs';
import { join, basename, extname, relative, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import XLSX from 'xlsx';
import mammoth from 'mammoth';
const __require = createRequire(import.meta.url);
const { PDFParse } = __require('pdf-parse');

const __dirname = dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const ROOT = resolve(__dirname, '..');
const FAQ_SRC = join(ROOT, 'FAQ');
const OUT_DIR = join(ROOT, 'products', 'FAQ');
const STAGING_DIR = `${OUT_DIR}.next`;
const REPORT_FILE = join(ROOT, 'logs', 'faq-build-report.json');

const DRY = process.argv.some((a) => a === '--dry-run');
const MAX_FILES = (() => {
  const m = process.argv.find((a) => a.startsWith('--max-files='));
  if (!m) return Infinity;
  const parsed = Number.parseInt(m.split('=')[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Infinity;
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
  return createHash('sha1').update(str, 'utf8').digest('hex').slice(0, 12);
}

function modelSlugify(value) {
  const slug = slugify(value);
  return slug === 'item' ? `model_${digest16(String(value ?? ''))}` : slug;
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
  const compactDate = name.match(/(?:^|[^0-9])(?:v|ver(?:sion)?[\s._-]*)?(\d{6})(?:[^0-9]|$)/i);
  if (compactDate) {
    const value = compactDate[1];
    const y = 2000 + Number(value.slice(0, 2));
    const m = Number(value.slice(2, 4));
    const d = Number(value.slice(4, 6));
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
const QUESTION_HEADER = /^(?:q|question|query|problem|issue|situation|topic|title|faq(?:\s*item)?|问题|常见问题|问题描述|故障问题|故障现象|症状|标题)$/i;
const ANSWER_HEADER = /^(?:a|answer|solution|resolution|reply|detail|content|solutions?|处理方法|解决方法|解决方案|答案|答复|详细内容)$/i;
const MODEL_HEADER = /^(?:product\s*model|model(?:\s*name)?|product(?:\s*name)?|适用机型|适配机型|机型|产品型号|产品名称)$/i;
const IGNORE_HEADER = /^(?:(?:answer|question|faq|record|article|knowledge)\s+)?(?:id|code|tags?|visit type|status|ranking|language|language code|编号|序号|标记|no\.?|s\.?\s*no\.?|number)$/i;
const SUPPORTED_LANGUAGES = new Set(['en', 'zh']);
const LANGUAGE_CODES = new Set([
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
  'hr', 'hu', 'id', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ro',
  'ru', 'sk', 'sv', 'th', 'tr', 'uk', 'vi', 'zh', 'zh-cn', 'zh-tw',
]);

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function languageCode(value) {
  const raw = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  const locale = raw.replace(/_/g, '-').match(/^([a-z]{2,3})(?:-[a-z0-9]+)*$/);
  if (locale) {
    if (locale[1] === 'cn') return 'zh';
    if (LANGUAGE_CODES.has(locale[1])) return locale[1];
  }
  const known = raw.match(/(?:^|[^a-z])([a-z]{2,3}(?:-[a-z]{2})?)(?:$|[^a-z])/);
  if (known) {
    if (/^en(?:-|$)/.test(known[1])) return 'en';
    if (/^(?:zh|cn)(?:-|$)/.test(known[1])) return 'zh';
    if (/^fr(?:-|$)/.test(known[1])) return 'fr';
    if (LANGUAGE_CODES.has(known[1])) return known[1];
  }
  const code = raw.replace(/[^a-z]/g, '');
  if (code === 'cn' || code === 'zhcn') return 'zh';
  if (code === 'zhtw') return 'zh-tw';
  if (LANGUAGE_CODES.has(code)) return code;
  if (/chinese|mandarin|中文|简体|繁體|繁体|普通话/.test(raw)) return /繁體|繁体/.test(raw) ? 'zh-tw' : 'zh';
  if (/english|英文/.test(raw)) return 'en';
  if (/german|德文|德语/.test(raw)) return 'de';
  if (/french|français|法文|法语/.test(raw)) return 'fr';
  if (/spanish|西班牙/.test(raw)) return 'es';
  if (/japanese|日文|日语/.test(raw)) return 'ja';
  if (/korean|韩文|韩语/.test(raw)) return 'ko';
  return '';
}

function headerRole(value) {
  const raw = String(value ?? '').normalize('NFKC').toLowerCase();
  const normalized = normalizeHeader(value);
  if (MODEL_HEADER.test(normalized)) return { role: 'model', lang: '' };
  if (IGNORE_HEADER.test(normalized)) return { role: 'ignore', lang: '' };
  const lang = languageCode(raw) || (/[\u4e00-\u9fff]/.test(raw) ? 'zh' : '');
  const contentHint = /content|answer|solution|resolution|reply|detail|内容|答案|解决|处理/.test(raw);
  if (QUESTION_HEADER.test(normalized) || (lang && !contentHint)) return { role: 'question', lang };
  if (ANSWER_HEADER.test(normalized) || (lang && contentHint)) return { role: 'answer', lang };
  return { role: 'other', lang };
}

function inferLanguage(...values) {
  for (const value of values) {
    const lang = languageCode(value);
    if (lang) return lang;
  }
  const text = values.map((value) => String(value ?? '')).join(' ');
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  return '';
}

function normalizeSupportedLanguage(value) {
  const language = String(value ?? '').toLowerCase();
  if (language === 'zh' || language.startsWith('zh-')) return 'zh';
  if (language === 'en' || language.startsWith('en-')) return 'en';
  return language;
}

function findHeaderRow(aoa) {
  let best = null;
  for (let rowIndex = 0; rowIndex < Math.min(10, aoa.length); rowIndex++) {
    const roles = aoa[rowIndex].map(headerRole);
    const questions = roles.filter((r) => r.role === 'question').length;
    const answers = roles.filter((r) => r.role === 'answer').length;
    const score = Math.min(questions, answers) * 10 + questions + answers;
    if (questions && answers && (!best || score > best.score)) best = { rowIndex, score };
  }
  return best;
}

function getQaColumnPairs(headers) {
  const roles = headers.map(headerRole);
  const questions = roles.flatMap((r, index) => r.role === 'question' ? [{ index, lang: r.lang }] : []);
  const answers = roles.flatMap((r, index) => r.role === 'answer' ? [{ index, lang: r.lang }] : []);
  const pairs = [];
  const usedAnswers = new Set();

  for (const question of questions) {
    const answer = answers.find((candidate) =>
      !usedAnswers.has(candidate.index) && question.lang && candidate.lang === question.lang
    );
    if (answer) {
      pairs.push({ questionIdx: question.index, answerIdx: answer.index, lang: question.lang });
      usedAnswers.add(answer.index);
    }
  }

  const remainingQuestions = questions.filter((question) => !pairs.some((pair) => pair.questionIdx === question.index));
  for (const question of remainingQuestions) {
    const answer = answers.find((candidate) =>
      !usedAnswers.has(candidate.index) &&
      (!question.lang || !candidate.lang || question.lang === candidate.lang)
    );
    if (!answer) continue;
    pairs.push({
      questionIdx: question.index,
      answerIdx: answer.index,
      lang: question.lang || answer.lang,
    });
    usedAnswers.add(answer.index);
  }
  return {
    pairs,
    roles,
    unmatchedQuestions: questions.filter((question) =>
      !pairs.some((pair) => pair.questionIdx === question.index)
    ),
    unmatchedAnswers: answers.filter((answer) => !usedAnswers.has(answer.index)),
  };
}

// ------------------------- per-format readers -------------------------

async function readWorkbook(file) {
  try {
    // cellText=false: formula results are calculated as strings but we also want values.
    return XLSX.readFile(file, { cellDates: true });
  } catch (e) {
    console.warn(`  [xlsx] 读失败 ${basename(file)}: ${e.message}`);
    buildIssues.push({
      source: relative(ROOT, file).replace(/\\/g, '/'),
      sheet: '',
      reason: `Workbook could not be read: ${e.message}`,
    });
    return null;
  }
}

function sheetToAoa(ws) {
  // header=1 means array of arrays; defval='' so empty cells are '' not undefined
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
}

function writeMd(filename, content) {
  const p = join(STAGING_DIR, filename);
  if (DRY) return console.log(`  DRY write ${filename} (${content.length} chars)`);
  writeFileSync(p, content, 'utf8');
  writtenCount++;
}

let writtenCount = 0;
let qaCount = 0;
let docCount = 0;
let skippedDupeCount = 0;
const faqRecords = [];
const buildIssues = [];
const skippedLanguageRows = new Map();
const skippedLanguageSheets = new Map();
const skippedNonQaSheets = [];
const sheetStats = new Map();

// ------------------------- main dedupe + dispatch -------------------------

async function main() {
  const allFiles = walk(FAQ_SRC).filter((p) => {
    const name = basename(p);
    if (name.startsWith('~$')) return false; // Office temp lock files → delete later
    const ext = extname(name).toLowerCase();
    return ['.xlsx', '.xls', '.docx', '.pdf'].includes(ext);
  }).sort((a, b) => a.localeCompare(b));
  console.log(`[discover] FAQ 源文件候选：${allFiles.length} 个`);

  // Dedupe records, not workbooks: one workbook may contain unique language
  // tabs or questions that would be lost by choosing a single file winner.
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

  const limited = metas.slice(0, MAX_FILES);
  if (!DRY && limited.length < metas.length) {
    throw new Error(
      `Refusing to replace the full FAQ library with a partial run ` +
      `(${limited.length}/${metas.length} source files). Use --dry-run or omit --max-files.`,
    );
  }
  if (!DRY) {
    if (existsSync(STAGING_DIR)) rmSync(STAGING_DIR, { recursive: true, force: true });
    mkdirSync(STAGING_DIR, { recursive: true });
  } else {
    console.log(`[dry-run] staging output: ${STAGING_DIR}`);
  }

  console.log(`[process] processing ${limited.length} source files${MAX_FILES < metas.length ? ` (limited to ${MAX_FILES})` : ''}...`);

  for (let i = 0; i < limited.length; i++) {
    const meta = limited[i];
    console.log(`\n[${i + 1}/${limited.length}] [${meta.category}] ${meta.name}`);
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

  const winners = dedupeFaqRecords(faqRecords);
  if (!DRY && winners.length === 0) {
    throw new Error('No valid FAQ records were parsed; leaving the existing FAQ library untouched.');
  }
  skippedDupeCount = faqRecords.length - winners.length;
  const baseIds = winners.map((record) =>
    digest16(`${record.category}::${record.modelSlug}::${record.lang}::${record.question}`)
  );
  const baseIdCounts = new Map();
  for (const id of baseIds) baseIdCounts.set(id, (baseIdCounts.get(id) ?? 0) + 1);
  const finalIds = new Set();
  winners.forEach((record, index) => {
    const baseId = baseIds[index];
    record.id = baseIdCounts.get(baseId) === 1
      ? baseId
      : digest16(`${record.category}::${record.modelSlug}::${record.model}::${record.lang}::${record.question}`);
    if (finalIds.has(record.id)) throw new Error(`FAQ id collision after disambiguation: ${record.id}`);
    finalIds.add(record.id);
  });
  for (const record of winners) writeFaqRecord(record);

  if (!DRY) {
    const backupDir = `${OUT_DIR}.previous`;
    if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
    if (existsSync(OUT_DIR)) renameSync(OUT_DIR, backupDir);
    try {
      renameSync(STAGING_DIR, OUT_DIR);
      if (existsSync(backupDir)) rmSync(backupDir, { recursive: true, force: true });
    } catch (error) {
      if (!existsSync(OUT_DIR) && existsSync(backupDir)) renameSync(backupDir, OUT_DIR);
      throw error;
    }
    mkdirSync(join(ROOT, 'logs'), { recursive: true });
    writeFileSync(REPORT_FILE, JSON.stringify({
      generatedAt: new Date().toISOString(),
      sourcesProcessed: limited.length,
      faqRecordsRead: faqRecords.length,
      faqRecordsWritten: winners.length,
      duplicatesSkipped: skippedDupeCount,
      documentsWritten: docCount,
      skippedLanguageRows: Object.fromEntries([...skippedLanguageRows].sort(([a], [b]) => a.localeCompare(b))),
      skippedLanguageSheets: Object.fromEntries([...skippedLanguageSheets].sort(([a], [b]) => a.localeCompare(b))),
      skippedNonQaSheets,
      sheets: [...sheetStats].map(([sourceSheet, stats]) => ({ sourceSheet, ...stats })),
      issues: buildIssues,
    }, null, 2) + '\n');
  }

  console.log('\n================ RESULT ================');
  console.log(`  FAQ rows read:       ${faqRecords.length}`);
  console.log(`  duplicate rows:      ${skippedDupeCount}`);
  console.log(`  FAQ entries written: ${qaCount}`);
  console.log(`  imported documents:  ${docCount}`);
  console.log(`  non-EN/ZH rows skipped: ${[...skippedLanguageRows.values()].reduce((sum, count) => sum + count, 0)}`);
  console.log(`  non-EN/ZH sheets skipped: ${[...skippedLanguageSheets.values()].reduce((sum, count) => sum + count, 0)}`);
  console.log(`  non-Q&A sheets skipped: ${skippedNonQaSheets.length}`);
  console.log(`  build issues:        ${buildIssues.length}`);
  console.log(`  total files written: ${writtenCount}`);
  console.log(`  review report:       ${relative(ROOT, REPORT_FILE)}`);
  console.log('========================================');

  for (const issue of buildIssues.slice(0, 20)) {
    console.warn(`  REVIEW ${issue.source} · ${issue.sheet}: ${issue.reason}`);
  }
}

// ------------------------- per-type processors -------------------------

async function processSheet(meta) {
  const wb = await readWorkbook(meta.path);
  if (!wb) return;

  for (const sheetName of wb.SheetNames) {
    const sheetLanguage = normalizeSupportedLanguage(inferLanguage(sheetName));
    if (sheetLanguage && !SUPPORTED_LANGUAGES.has(sheetLanguage)) {
      skippedLanguageSheets.set(sheetLanguage, (skippedLanguageSheets.get(sheetLanguage) ?? 0) + 1);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = sheetToAoa(ws);
    if (aoa.length < 2) continue; // need at least header + 1 data row

    const header = findHeaderRow(aoa);
    if (!header) {
      skippedNonQaSheets.push({
        source: relative(ROOT, meta.path).replace(/\\/g, '/'),
        sheet: sheetName,
        reason: 'No explicit question-and-answer headers found.',
      });
      continue;
    }
    const headerRowIdx = header.rowIndex;
    const headers = aoa[headerRowIdx].map((c) => String(c ?? '').trim());
    const rows = aoa.slice(headerRowIdx + 1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0));
    if (rows.length === 0) continue;

    const { pairs, roles, unmatchedQuestions, unmatchedAnswers } = getQaColumnPairs(headers);
    if (pairs.length === 0) {
      skippedNonQaSheets.push({
        source: relative(ROOT, meta.path).replace(/\\/g, '/'),
        sheet: sheetName,
        reason: 'No unambiguous question/answer column pair was found.',
      });
      continue;
    }
    if (unmatchedQuestions.length || unmatchedAnswers.length) {
      buildIssues.push({
        source: relative(ROOT, meta.path),
        sheet: sheetName,
        reason: `Unpaired language columns were skipped (${unmatchedQuestions.length} question, ${unmatchedAnswers.length} answer).`,
      });
    }
    const sourceSheet = `${relative(ROOT, meta.path).replace(/\\/g, '/')}:${sheetName}`;
    sheetStats.set(sourceSheet, { rows: rows.length, qaPairs: pairs.length, records: 0 });
    collectQaRows(headers, rows, roles, pairs, meta, sheetName, sourceSheet);
  }
}

function collectQaRows(headers, rows, roles, pairs, meta, sheetName, sourceSheet) {
  const modelIdx = roles.findIndex((r) => r.role === 'model');
  const languageIdx = headers.findIndex((header) => /^language\b/i.test(normalizeHeader(header)));
  const visitTypeIdx = headers.findIndex((header) => /^visit type$/i.test(normalizeHeader(header)));
  const idIdx = headers.findIndex((header) => /^(?:answer id|id|编号)$/i.test(normalizeHeader(header)));
  const stats = sheetStats.get(sourceSheet);

  for (const row of rows) {
    if (visitTypeIdx >= 0 && /^redirect$/i.test(String(row[visitTypeIdx] ?? '').trim())) continue;
    const modelCell = modelIdx >= 0 ? String(row[modelIdx] ?? '').trim() : '';
    const models = splitModelNames(modelCell || inferModelFromFilename(meta.name, meta.category, meta.path));
    for (const pair of pairs) {
      const question = String(row[pair.questionIdx] ?? '').trim();
      const answer = String(row[pair.answerIdx] ?? '').trim();
      if (!question && !answer) continue;
      if (!question || !answer) {
        buildIssues.push({
          source: relative(ROOT, meta.path),
          sheet: sheetName,
          rowId: idIdx >= 0 ? String(row[idIdx] ?? '') : '',
          reason: `Incomplete FAQ row (${question ? 'answer missing' : 'question missing'}); skipped.`,
        });
        continue;
      }
      const rowLanguage = languageIdx >= 0 ? String(row[languageIdx] ?? '') : '';
      const inferredLanguage = inferLanguage(rowLanguage, sheetName, meta.name, question);
      const fileLanguage = normalizeSupportedLanguage(meta.lang);
      const detectedLanguage = pair.lang || inferredLanguage
        || (SUPPORTED_LANGUAGES.has(fileLanguage) ? fileLanguage : '');
      const lang = normalizeSupportedLanguage(detectedLanguage);
      if (!SUPPORTED_LANGUAGES.has(lang)) {
        const skippedLanguage = lang || 'unknown';
        skippedLanguageRows.set(skippedLanguage, (skippedLanguageRows.get(skippedLanguage) ?? 0) + 1);
        continue;
      }
      for (const model of models) {
        faqRecords.push({
          category: meta.category,
          model,
          modelSlug: modelSlugify(model),
          lang,
          source: relative(ROOT, meta.path).replace(/\\/g, '/'),
          sourceSheet: sheetName,
          sourceRowId: idIdx >= 0 ? String(row[idIdx] ?? '').trim() : '',
          question: normalizeContent(question),
          answer: normalizeContent(answer),
          version: meta.version || 1,
          dateStamp: meta.dateStamp,
          fileSize: meta.size,
          mtime: meta.mtime,
        });
        if (stats) stats.records += 1;
      }
    }
  }
}

function splitModelNames(value) {
  return [...new Set(String(value ?? '')
    .split(/[,;，；\n]+/)
    .map((model) => model.trim())
    .filter(Boolean))];
}

function inferModelFromFilename(filename, category, sourcePath) {
  let label = basename(filename, extname(filename))
    .replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
    .replace(/（[^）]*）|\([^)]*\)/g, ' ')
    .replace(/\b(?:FAQ|multi[- ]language|中英文|中英|中文版|英文版|overseas|海外|basic data|纯文字版|用户侧|user side|终版|多语言|\d+\s*(?:languages?|langs?))\b/ig, ' ')
    .replace(/\b(?:v(?:ersion)?\s*)?\d+(?:[._]\d+){0,2}\b/ig, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(?:faq|general|item)$/i.test(label)) label = '';

  if (!label) {
    const parent = basename(dirname(sourcePath)).replace(/\b20\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
    const categoryName = category.toLowerCase();
    if (parent && !['faq', categoryName].includes(parent.toLowerCase())) {
      label = /^winbot\b/i.test(parent) || parent.toLowerCase().startsWith(categoryName)
        ? parent
        : `${category} ${parent}`;
    }
  }

  return label || 'General';
}

function normalizeContent(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

function dedupeFaqRecords(records) {
  const byKey = new Map();
  const normalizedKey = (value) => normalizeContent(value).toLowerCase().replace(/\s+/g, ' ');
  for (const record of records) {
    const key = [
      record.category,
      record.modelSlug,
      normalizedKey(record.model),
      record.lang,
      normalizedKey(record.question),
    ].join('::');
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, record);
      continue;
    }
    const preferred = (candidate) =>
      candidate.version * 1e15 + candidate.dateStamp * 1e2 + candidate.mtime;
    if (preferred(record) > preferred(previous)) byKey.set(key, record);
  }
  return [...byKey.values()].sort((a, b) =>
    a.category.localeCompare(b.category) ||
    a.modelSlug.localeCompare(b.modelSlug) ||
    a.lang.localeCompare(b.lang) ||
    a.question.localeCompare(b.question)
  );
}

function writeFaqRecord(record) {
  const id = record.id;
  const filename = `faq_${slugify(record.category)}_${record.modelSlug}_${record.lang}_${id}.md`;
  const safe = (value) => JSON.stringify(String(value ?? ''));
  const displayTitle = [
    record.category,
    record.model || 'General',
    record.lang.toUpperCase(),
  ].join(' / ') + ` - ${normalizeContent(record.question).replace(/\s+/g, ' ')}`;
  const body = `---
category: ${safe(record.category)}
model: ${safe(record.model)}
model_slug: ${safe(record.modelSlug)}
lang: ${safe(record.lang)}
source: ${safe(record.source)}
source_sheet: ${safe(record.sourceSheet)}
source_row_id: ${safe(record.sourceRowId)}
kind: faq
version: ${record.version}
---

# ${displayTitle}

## Question

${record.question}

## Answer

${record.answer}
`;
  writeMd(filename, body);
  qaCount++;
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
    const parser = new PDFParse({ data: buf });
    let data;
    try {
      data = await parser.getText();
    } finally {
      await parser.destroy();
    }
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
