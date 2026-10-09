#!/usr/bin/env node
/**
 * sync-roster.mjs — fetch the AMR NA Roster from Feishu and regenerate the
 * per-month roster TypeScript data files used by the dashboard.
 *
 * Usage:
 *   node scripts/sync-roster.mjs            # fetch all configured months
 *   node scripts/sync-roster.mjs 2026-10    # fetch a single month
 *
 * Source: the Feishu wiki workbook "AMR NA Roster 2026". Each month has a
 * "<YYYY> <Mon> ECOVACS" sheet with rows 1-3 = headers, row 4+ = agents,
 * columns A-G = metadata (No / HR / Name / EN / Skill / Hired / Joined),
 * columns H+ = one column per calendar day of that month.
 *
 * Output: src/data/roster-<YYYY-MM>.ts exporting ROSTER_<YYYYMM> and the
 * RosterAgent interface (re-exported from a shared index).
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'src', 'data');

const WIKI_URL = 'https://lmgx8md8u1.feishu.cn/wiki/QtV3wEQqOiWSe2kyqLMcxu3knvd';

/** Months to sync — { sheetId, label, year, month (1-12) }. */
const MONTHS = [
  { sheetId: 'WaX7DS', label: '2026 Oct ECOVACS', year: 2026, month: 10 },
  { sheetId: 'UMydVL', label: '2026 Nov ECOVACS', year: 2026, month: 11 },
];

const OFF_CODES = new Set(['OFF', 'PH', 'AL', '调休', '病假', '事假']);

/** Run lark-cli and return parsed JSON data. */
function lark(args) {
  const out = execFileSync('lark-cli', args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(out);
}

/** Fetch a sheet's full CSV via lark-cli sheets +csv-get. */
function fetchSheet(sheetId, maxRow = 200) {
  const res = lark([
    'sheets', '+csv-get',
    '--url', WIKI_URL,
    '--sheet-id', sheetId,
    '--range', `A1:AL${maxRow}`,
  ]);
  if (!res.ok) throw new Error(`lark-cli failed for sheet ${sheetId}: ${JSON.stringify(res.error)}`);
  return res.data.annotated_csv;
}

/** Parse the annotated CSV (rows prefixed with "[row=N] ") into a 2D array. */
function parseAnnotatedCsv(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\[row=\d+\]\s?(.*)$/);
    if (!m) continue;
    rows.push(splitCsvLine(m[1]));
  }
  return rows;
}

/** Minimal CSV splitter that handles quoted fields. */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Build ISO date strings for a given year/month's days. */
function dateKeys(year, month, count) {
  const mm = String(month).padStart(2, '0');
  const keys = [];
  for (let d = 1; d <= count; d++) keys.push(`${year}-${mm}-${String(d).padStart(2, '0')}`);
  return keys;
}

/** Count non-working shifts for the offPh stat. */
function countOff(shifts) {
  return Object.values(shifts).filter((c) => OFF_CODES.has(c)).length;
}

/**
 * Parse one month's sheet into RosterAgent[].
 * Row layout: row 0 = month title, row 1 = column headers, row 2 = day numbers,
 * row 3+ = agent rows. Metadata in cols 0-6, day shifts start at col 7.
 */
function parseMonthSheet(annotatedCsv, year, month) {
  const rows = parseAnnotatedCsv(annotatedCsv);
  if (rows.length < 4) throw new Error(`Sheet too short (${rows.length} rows)`);

  const dayNumbers = rows[2].slice(7).map((v) => parseInt(String(v ?? '').trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  const numDays = new Date(year, month, 0).getDate(); // last day of month
  const keys = dateKeys(year, month, numDays);

  const agents = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const no = String(r[0] ?? '').trim();
    // Agent rows have a numeric "序号" in column 0; summary rows don't.
    if (!no || !/^\d+$/.test(no)) continue;
    const hr = String(r[1] ?? '').trim();
    const zh = String(r[2] ?? '').trim();
    const en = String(r[3] ?? '').trim();
    const skill = String(r[4] ?? '').trim();
    const hired = String(r[5] ?? '').trim();
    const joined = String(r[6] ?? '').trim();
    if (!en) continue;

    const shifts = {};
    for (let d = 0; d < numDays; d++) {
      const code = String(r[7 + d] ?? '').trim();
      shifts[keys[d]] = code;
    }
    agents.push({
      no, hr, zh, en, skill, hired, joined,
      offPh: String(countOff(shifts)),
      bhc: '',
      phc: '',
      shifts,
    });
  }
  return agents;
}

/** Emit a roster data TypeScript file. */
function writeRosterFile(year, month, agents) {
  const yyyymm = `${year}${String(month).padStart(2, '0')}`;
  const varName = `ROSTER_${yyyymm}`;
  const out = resolve(DATA_DIR, `roster-${year}-${String(month).padStart(2, '0')}.ts`);

  const lines = [];
  lines.push('/**');
  lines.push(` * AMR NA Roster — ${year}-${String(month).padStart(2, '0')} — auto-generated by`);
  lines.push(` * scripts/sync-roster.mjs from the Feishu workbook "AMR NA Roster 2026".`);
  lines.push(` * Snapshot: ${new Date().toISOString().slice(0, 10)}. Off-shift codes (OFF/PH/AL/`);
  lines.push(` * 调休/病假/事假) are preserved; offPh counts them. bhc/phc are not in this sheet.`);
  lines.push(' */');
  lines.push('');
  lines.push('import type { RosterAgent } from \'./roster\';');
  lines.push('');
  lines.push(`export const ${varName}: RosterAgent[] = [`);
  for (const a of agents) {
    const shiftEntries = Object.entries(a.shifts)
      .map(([d, c]) => `'${d}': '${c.replace(/'/g, "\\'")}'`)
      .join(', ');
    lines.push(`  { no: '${a.no}', hr: '${a.hr}', zh: '${a.zh}', en: "${a.en}", skill: '${a.skill}', hired: '${a.hired}', joined: '${a.joined}', offPh: '${a.offPh}', bhc: '${a.bhc}', phc: '${a.phc}',`);
    lines.push(`    shifts: { ${shiftEntries} } },`);
  }
  lines.push('];');
  lines.push('');
  writeFileSync(out, lines.join('\n'), 'utf-8');
  console.log(`  wrote ${out.replace(ROOT + '/', '')} (${agents.length} agents, ${year}-${month})`);
  return { varName, path: `./roster-${year}-${String(month).padStart(2, '0')}` };
}

/** Regenerate the shared index + RosterAgent type + a getRoster helper. */
function writeIndex(exports) {
  const typePath = resolve(DATA_DIR, 'roster.ts');
  const typeLines = [
    '/**',
    ' * Shared roster types. Auto-generated companion of sync-roster.mjs.',
    ' */',
    '',
    'export interface RosterAgent {',
    "  no: string;",
    "  hr: string;",
    "  zh: string;",
    "  /** English name — the display/filter key. */",
    "  en: string;",
    "  /** Main skill: SV / TL / T2 / T3 / FR Call / DTC / Chat / Call … */",
    "  skill: string;",
    "  hired: string;",
    "  joined: string;",
    '  /** Count of OFF/PH/AL/调休/病假/事假 days in the month. */',
    "  offPh: string;",
    "  /** BHC — computed by the source sheet (empty if absent). */",
    "  bhc: string;",
    "  /** PHC — computed by the source sheet (empty if absent). */",
    "  phc: string;",
    "  /** ISO date (YYYY-MM-DD) → shift code. */",
    "  shifts: Record<string, string>;",
    '}',
    '',
  ];
  writeFileSync(typePath, typeLines.join('\n'), 'utf-8');

  const indexPath = resolve(DATA_DIR, 'roster-index.ts');
  const idxLines = [
    '/**',
    ' * Roster index — maps month keys to their roster arrays.',
    ' * Auto-generated by scripts/sync-roster.mjs.',
    ' */',
    '',
    "import type { RosterAgent } from './roster';",
  ];
  for (const e of exports) idxLines.push(`import { ${e.varName} } from '${e.path}';`);
  idxLines.push('');
  idxLines.push('const ROSTERS: Record<string, RosterAgent[]> = {');
  for (const e of exports) {
    const m = e.varName.replace('ROSTER_', '');
    idxLines.push(`  '${m.slice(0, 4)}-${m.slice(4)}': ${e.varName},`);
  }
  idxLines.push('};');
  idxLines.push('');
  idxLines.push('/** Returns the roster for the given month key (YYYY-MM), or undefined. */');
  idxLines.push('export function getRoster(monthKey: string): RosterAgent[] | undefined {');
  idxLines.push('  return ROSTERS[monthKey];');
  idxLines.push('}');
  idxLines.push('');
  idxLines.push('/** All available roster month keys, sorted. */');
  idxLines.push('export const ROSTER_MONTHS = Object.keys(ROSTERS).sort();');
  idxLines.push('');
  writeFileSync(indexPath, idxLines.join('\n'), 'utf-8');
  console.log(`  wrote roster.ts + roster-index.ts (${exports.length} months)`);
}

// --- main ---
const requested = process.argv[2]; // e.g. "2026-10"
mkdirSync(DATA_DIR, { recursive: true });

const targets = requested
  ? MONTHS.filter((m) => `${m.year}-${String(m.month).padStart(2, '0')}` === requested)
  : MONTHS;

if (targets.length === 0) {
  console.error(`No configured month matches "${requested}". Available: ${MONTHS.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}`).join(', ')}`);
  process.exit(1);
}

const generated = [];
for (const m of targets) {
  console.log(`Fetching ${m.label} (sheet ${m.sheetId})…`);
  const csv = fetchSheet(m.sheetId);
  const agents = parseMonthSheet(csv, m.year, m.month);
  generated.push(writeRosterFile(m.year, m.month, agents));
}

writeIndex(generated);
console.log('Done.');
