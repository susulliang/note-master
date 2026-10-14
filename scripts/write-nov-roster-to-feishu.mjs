#!/usr/bin/env node
/**
 * write-nov-roster-to-feishu.mjs — push the generated November 2026 roster
 * (src/data/roster-2026-11.ts) back into the Feishu workbook sheet
 * "20206 Nov ECOVACS":
 *
 *   • Row 1 weekday header FIXED — Nov 1 2026 is a SUNDAY (the template
 *     wrongly started 周四, copied from October).
 *   • Row 2 day numbers 1–30 (the stale day-31 column AL is cleared).
 *   • Rows 3–42 agent shift block (40 agents, order = sheet 序号 order).
 *   • Rows 43–69 stat rows written as LIVE COUNTIF formulas mirroring the
 *     October sheet's formula layout (上班总人数 / OM / TL / T2 / per-shift /
 *     T3 / 校验 / SV / TL / T2 / per-shift Call / Totall Call / per-shift
 *     Chat / Total Chat / Total on Duty / HeadCount / Trainee).
 *
 * Reuse: point DATA_FILE / SHEET / row bands at another month to repeat.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIKI = 'https://lmgx8md8u1.feishu.cn/wiki/QtV3wEQqOiWSe2kyqLMcxu3knvd';
const SHEET = 'UMydVL'; // "20206 Nov ECOVACS"
const YEAR = 2026;
const MONTH = 11; // November (1-based)
const DAYS = 30;
const DATA_FILE = 'src/data/roster-2026-11.ts';

/* Sheet row bands (1-based): agents 3–42.
 *   3 Hoi(SV) · 4–5 TL · 6–8 T2 · 9–10 T3 · 11–17 Chat · 18–39 Call ·
 *   40 Jing(FR) · 41–42 DTC (Peter, Maggie) */
const FRONT_LINE = '11:40'; // Dagen..Jing (mirror Oct's 一线 band, excl. DTC)
const ON_DUTY_BAND = '3:40'; // Hoi..Jing (excl. DTC — mirror Oct 上班总人数)
const CALL_BAND = '18:40'; // Call + FR Call
const CHAT_BAND = '11:17';

function lark(args) {
  const out = execFileSync('lark-cli', args, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(out);
}

function csvPut(startCell, rows) {
  const csv = rows
    .map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))
    .join('\n');
  const res = lark([
    'sheets', '+csv-put',
    '--url', WIKI, '--sheet-id', SHEET,
    '--start-cell', startCell, '--csv', csv,
  ]);
  if (!res.ok) throw new Error(`csv-put failed at ${startCell}: ${JSON.stringify(res.error)}`);
  console.log(`  wrote ${startCell} (${rows.length} rows x ${rows[0].length} cols)`);
}

/** 1-based column number → A1 letters (8 = H, 37 = AK). */
function colName(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* ------------------------------ load data -------------------------------- */

const src = readFileSync(resolve(ROOT, DATA_FILE), 'utf8');
const block = src.match(/ROSTER_202611[\s\S]*?\n\];/)[0];
const agents = [...block.matchAll(/en: "([^"]+)"[\s\S]*?shifts: \{ ([\s\S]*?) \} \}/g)].map((m) => ({
  en: m[1],
  shifts: Object.fromEntries(
    [...m[2].matchAll(/'(\d{4}-\d{2}-\d{2})': '([^']*)'/g)].map((x) => [x[1], x[2]])
  ),
}));
if (agents.length !== 40) throw new Error(`expected 40 agents, got ${agents.length}`);
const iso = (d) => `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

console.log(`Writing November ${YEAR} roster to sheet ${SHEET}…`);

/* --------------------------- 1. weekday header ---------------------------- */
/* Nov 1 2026 = SUNDAY. The template row (copied from Oct) starts 周四. */
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
csvPut('H1', [Array.from({ length: DAYS }, (_, i) => WD[new Date(YEAR, MONTH - 1, i + 1).getDay()])]);
csvPut('H2', [Array.from({ length: DAYS }, (_, i) => String(i + 1))]);

/* ----------------------------- 2. agent block ----------------------------- */
csvPut(
  'H3',
  agents.map((a) => Array.from({ length: DAYS }, (_, i) => a.shifts[iso(i + 1)] ?? ''))
);

/* ------------------------------ 3. stat rows ------------------------------ */
/* (row, formula generator per column letter) — mirrors the Oct formulas. */
const statRows = [
  [43, (c) => `=COUNTIF(${c}${ON_DUTY_BAND},\"=*A*\")+COUNTIF(${c}${ON_DUTY_BAND},\"=*B07*\")`], // 上班总人数
  [44, (c) => `=COUNTIF(${c}3,\"=*A*\")`],                                                                   // OM人数
  [45, (c) => `=COUNTIF(${c}4:${c}5,\"=*A*\")`],                                                             // TL人数
  [46, (c) => `=COUNTIF(${c}6:${c}8,\"=*A*\")`],                                                             // T2人数
  [47, (c) => `=COUNTIF(${c}${FRONT_LINE},\"=*A06*\")`],
  [48, (c) => `=COUNTIF(${c}${FRONT_LINE},\"=*A09*\")`],
  [49, (c) => `=COUNTIF(${c}${FRONT_LINE},\"=*A21*\")`],
  [50, (c) => `=COUNTIF(${c}${FRONT_LINE},\"=*A22*\")`],
  [51, (c) => `=COUNTIF(${c}${FRONT_LINE},\"=*A23*\")`],
  [52, (c) => `=COUNTIF(${c}${FRONT_LINE},\"=*A00*\")`],
  [53, (c) => `=COUNTIF(${c}9:${c}10,\"=*A*\")+COUNTIF(${c}9:${c}10,\"=*B*\")`],                              // T3人数
  [54, (c) => `=${c}43-SUM(${c}44:${c}53)`],                                                                  // 校验
  [55, (c) => `=COUNTIF(${c}3,\"=*A*\")`],                                                                    // SV
  [56, (c) => `=COUNTIF(${c}4:${c}5,\"=*A*\")`],                                                              // TL
  [57, (c) => `=COUNTIF(${c}6:${c}8,\"=*A*\")`],                                                              // T2
  [58, (c) => `=COUNTIF(${c}${CALL_BAND},\"=*A21*\")`],                                                       // A21 Call
  [59, (c) => `=COUNTIF(${c}${CALL_BAND},\"=*A22*\")`],                                                       // A22 Call
  [60, (c) => `=COUNTIF(${c}${CALL_BAND},\"=*A23*\")`],                                                       // A23 Call
  [61, (c) => `=COUNTIF(${c}${CALL_BAND},\"=*A00*\")`],                                                       // A00 Call
  [62, (c) => `=COUNTIF(${c}${CALL_BAND},\"=*A*\")+COUNTIF(${c}${CALL_BAND},\"=*B07*\")`],                    // Totall Call
  [63, (c) => `=COUNTIF(${c}${CHAT_BAND},\"=*A21*\")`],                                                       // A21 Chat
  [64, (c) => `=COUNTIF(${c}${CHAT_BAND},\"=*A22*\")`],                                                       // A22 Chat
  [65, (c) => `=COUNTIF(${c}${CHAT_BAND},\"=*A00*\")`],                                                       // A00 Chat
  [66, (c) => `=COUNTIF(${c}${CHAT_BAND},\"=*A*\")+COUNTIF(${c}${CHAT_BAND},\"=*B07*\")`],                    // Total Chat
  [67, (c) => `=COUNTIF(${c}3:${c}42,\"=*A*\")+COUNTIF(${c}3:${c}42,\"=*B07*\")`,],                           // Total on Duty Agent
  [68, (c) => `=COUNTA(${c}3:${c}42)`],                                                                       // Total HeadCount
  [69, (c) => `=COUNTIF(${c}3:${c}42,\"=*TR*\")`],                                                            // Trainee
];

for (const [row, gen] of statRows) {
  const cells = [Array.from({ length: DAYS }, (_, i) => ({ formula: gen(colName(8 + i)) }))];
  const res = lark([
    'sheets', '+cells-set',
    '--url', WIKI, '--sheet-id', SHEET,
    '--range', `H${row}:AK${row}`,
    '--cells', JSON.stringify(cells),
  ]);
  if (!res.ok) throw new Error(`cells-set failed for row ${row}: ${JSON.stringify(res.error)}`);
  console.log(`  wrote stat row ${row} (formulas H..AK)`);
}

/* --------------------- 4. clear stale day-31 column ----------------------- */
/* The template's 31st day column (AL: weekday label + "31") is stale —
 * November has 30 days. Content-only clear of the two header cells. */
const clear = lark([
  'sheets', '+cells-clear',
  '--url', WIKI, '--sheet-id', SHEET,
  '--range', 'AL1:AL2', '--scope', 'content', '--yes',
]);
if (!clear.ok) throw new Error(`cells-clear failed: ${JSON.stringify(clear.error)}`);
console.log('  cleared stale day-31 header cells AL1:AL2');

/* ------------------------------ 5. verify --------------------------------- */
const check = lark([
  'sheets', '+csv-get', '--url', WIKI, '--sheet-id', SHEET,
  '--range', 'H1:AK3',
]);
if (!check.ok) throw new Error('verify read failed');
const verifyRows = check.data.annotated_csv.split('\n').filter((l) => l.startsWith('[row='));
const [r1, r2, r3] = verifyRows.map((l) => l.replace(/^\[row=\d+\]\s?/, ''));
const r1cells = r1.split(',');
const r2cells = r2.split(',');
const r3cells = r3.split(',');
if (r1cells[0] !== '周日' || r2cells[0] !== '1' || r3cells[0] !== 'A01') {
  throw new Error(`verify mismatch: H1=${r1cells[0]} H2=${r2cells[0]} H3=${r3cells[0]}`);
}
if (r1cells.length < 30 || r1cells[29] === '') throw new Error('weekday header incomplete');

const statCheck = lark([
  'sheets', '+cells-get', '--url', WIKI, '--sheet-id', SHEET,
  '--range', 'H43:AK43', '--include', 'value,formula',
]);
if (!statCheck.ok) throw new Error('stat verify failed');
const firstStat = statCheck.data.ranges[0].cells[0][0];
if (!firstStat.formula || !firstStat.formula.includes('COUNTIF')) {
  throw new Error(`上班总人数 formula missing: ${JSON.stringify(firstStat)}`);
}
console.log(`  verify OK — H1=${r1cells[0]} · H3=${r3cells[0]} · 上班总人数(H)=${firstStat.value}`);
console.log('Done.');
