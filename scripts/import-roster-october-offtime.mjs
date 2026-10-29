/**
 * import-roster-october-offtime.mjs — regenerate the baked October 2026 roster
 * from "roster october 2026 with offtime comments.xlsx" (the managers' final
 * October workbook) and extract per-cell billable-hours records.
 *
 * Sources of off-time (extra break hours, 调休/事假/年假/病假) are cell
 * COMMENTS in the sheet, e.g.:
 *   "Haoxiang Yang (杨浩祥): 调休1H"          → 1 extra off hour (7h billable)
 *   "Haoxiang Yang (杨浩祥): 调休2H0100-0300" → 2 extra off hours (6h billable)
 *   "Kailun Huang (黄铠伦): 调休1H: 24:00-01:00"
 *   "Haoxiang Yang (杨浩祥): 调休1 2100-2200"  → hours implied by the range
 *   "Yujun Wu (吴宇君): 病假：02：00-09：00"    → hours from the range (7h)
 * A standard shift is 9h with a 1h break = 8h billable by default.
 *
 * Outputs:
 *   1. src/data/roster-2026-10.ts  (ROSTER_202610 with offHours/offNote +
 *      DAY_TOTALS_202610 regenerated)
 *   2. .wrangler/tmp-roster/oct-offtime.sql → D1 roster_cells (with new
 *      off_hours / off_note columns, full-month replace)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const XLSX_PATH = resolve(ROOT, 'roster october 2026 with offtime comments.xlsx');
const OUT_DIR = resolve(ROOT, '.wrangler', 'tmp-roster');
const MONTH = '2026-10';

const YEAR = 2026;
const DAYS = 31;
const OFF_CODES = new Set(['OFF', 'PH', 'AL', '调休', '病假', '事假']);
/** Day-column index 5..35 = Oct 1..31 (indices 0..4 are Sep 26-30). */
const isoFor = (i) => `2026-10-${String(i - 4).padStart(2, '0')}`;

/**
 * Extracts total extra off-hours from one cell comment. Handles the formats
 * listed in the header plus a stray missing 休 ("调1H") and full-width colons.
 * Returns 0 when the comment carries no parsable off-time.
 */
function parseOffHours(text) {
  let total = 0;
  // 1) keyword + explicit hours ("调休1H", "调休2H0100-0300", "事假3H", "调1H")
  const re = /(调休|调|事假|年假|病假)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)(\s*(?:H|时|小时))?/g;
  let m;
  while ((m = re.exec(text))) {
    const hasUnit = !!m[3];
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 6);
    // A number WITHOUT a unit that is followed by a clock time ("调休1 2100-2200",
    // "病假：02：00-09：00") is not the hours — the range carries them instead.
    if (!hasUnit && (/^\s*[：:]/.test(tail) || /^\s*\d{2}\d{2}\s*[-–]/.test(tail))) continue;
    total += parseFloat(m[2]);
  }
  if (total > 0) return total;
  // 2) keyword + colon time range ("病假：02：00-09：00")
  const tm = /(调休|调|事假|年假|病假)\s*[:：]?\s*(\d{1,2})\s*[：:](\d{2})\s*[-–]\s*(\d{1,2})\s*[：:](\d{2})/.exec(text);
  if (tm) {
    let start = Number(tm[2]) + Number(tm[3]) / 60;
    let end = Number(tm[4]) + Number(tm[5]) / 60;
    if (end <= start) end += 24;
    return end - start;
  }
  // 3) keyword + plain HHMM-HHMM range, hours implied ("调休1 2100-2200")
  const hm = /(调休|调|事假|年假|病假)[^\d-]*(\d{1,2}(?:\.\d+)?)?\s*(\d{2})(\d{2})\s*[-–]\s*(\d{2})(\d{2})/.exec(text);
  if (hm) {
    if (hm[2] !== undefined) return parseFloat(hm[2]);
    let start = Number(hm[3]) + Number(hm[4]) / 60;
    let end = Number(hm[5]) + Number(hm[6]) / 60;
    if (end <= start) end += 24;
    return end - start;
  }
  return 0;
}

const buf = readFileSync(XLSX_PATH);
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets['Sheet3'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });

const agents = [];
const skippedNotes = [];
for (let r = 3; r < rows.length; r++) {
  const row = rows[r];
  const en = String(row[3] ?? '').trim();
  const skill = String(row[4] ?? '').trim();
  if (!en || !skill) continue; // summary rows have no Main Skill
  const shifts = {};
  const offHours = {};
  const offNote = {};
  for (let i = 5; i <= 35; i++) {
    const iso = isoFor(i);
    shifts[iso] = String(row[7 + i] ?? '').trim();
    const cell = ws[XLSX.utils.encode_cell({ r, c: 7 + i })];
    const text = (cell?.c ?? []).map((p) => p.t ?? '').join('').trim();
    if (!text) continue;
    const hours = parseOffHours(text);
    if (hours > 0) {
      offHours[iso] = hours;
      offNote[iso] = text.replace(/\s+/g, ' ').slice(0, 160);
    } else {
      skippedNotes.push(`${en} ${iso}: ${text.replace(/\s+/g, ' ').slice(0, 80)}`);
    }
  }
  agents.push({
    no: String(agents.length + 1),
    hr: String(row[1] ?? '').trim(),
    zh: String(row[2] ?? '').trim(),
    en,
    skill,
    hired: '',
    joined: '',
    offPh: String(Object.values(shifts).filter((c) => OFF_CODES.has(c)).length),
    bhc: '',
    phc: '',
    shifts,
    offHours: Object.keys(offHours).length ? offHours : undefined,
    offNote: Object.keys(offNote).length ? offNote : undefined,
  });
}
console.log(`parsed ${agents.length} agents, ` +
  `${agents.filter((a) => a.offHours).length} with off-time records, ` +
  `${Object.values(agents).reduce((s, a) => s + Object.keys(a.offHours ?? {}).length, 0)} off-time cells`);
if (agents.length < 30) throw new Error('Suspiciously few agents — aborting');
for (const a of agents) {
  if (Object.keys(a.shifts).length !== DAYS) throw new Error(`${a.en} has ${Object.keys(a.shifts).length} Oct days`);
}
console.log('--- non-hour notes (informational, not counted):');
for (const s of skippedNotes) console.log('   ', s);

/* ---------------- 1. baked roster-2026-10.ts ---------------- */
const tsLines = [];
tsLines.push('/**');
tsLines.push(' * AMR NA Roster — 2026-10 — imported from the managers\' final workbook');
tsLines.push(' * "roster october 2026 with offtime comments.xlsx" (baked offline');
tsLines.push(' * fallback; the RosterRoom DO is the first line, D1 roster_cells the');
tsLines.push(' * backup). Includes per-cell billable off-time records extracted from');
tsLines.push(' * the sheet\'s cell comments (offHours = extra off hours on top of the');
tsLines.push(' * standard 1h break; billable = 8h - offHours for worked shifts).');
tsLines.push(` * Snapshot: ${new Date().toISOString().slice(0, 10)}.`);
tsLines.push(' */');
tsLines.push('');
tsLines.push("import type { RosterAgent, DayTotalRow } from './roster';");
tsLines.push('');
tsLines.push('export const ROSTER_202610: RosterAgent[] = [');
for (const a of agents) {
  const shiftEntries = Object.entries(a.shifts)
    .map(([d, c]) => `'${d}': '${c.replace(/'/g, "\\'")}'`)
    .join(', ');
  tsLines.push(`  { no: '${a.no}', hr: '${a.hr}', zh: '${a.zh}', en: "${a.en}", skill: '${a.skill}', hired: '${a.hired}', joined: '${a.joined}', offPh: '${a.offPh}', bhc: '${a.bhc}', phc: '${a.phc}',`);
  tsLines.push(`    shifts: { ${shiftEntries} },`);
  if (a.offHours) {
    const h = Object.entries(a.offHours).map(([d, v]) => `'${d}': ${v}`).join(', ');
    tsLines.push(`    offHours: { ${h} },`);
  }
  if (a.offNote) {
    const n = Object.entries(a.offNote).map(([d, v]) => `'${d}': ${JSON.stringify(v)}`).join(', ');
    tsLines.push(`    offNote: { ${n} },`);
  }
  tsLines.push('  },');
}
tsLines.push('];');
tsLines.push('');

// Day totals — computed from the agent shifts (same labels as before).
const isos = Object.keys(agents[0].shifts).sort();
const onDuty = (a, iso) => !OFF_CODES.has(a.shifts[iso]);
const codeCount = (iso, code) => agents.filter((a) => a.shifts[iso] === code).length;
const skillOnDuty = (iso, match) => agents.filter((a) => a.skill.includes(match) && onDuty(a, iso)).length;
const totalRows = [
  { label: '上班总人数', fn: (iso) => agents.filter((a) => onDuty(a, iso)).length },
  { label: 'OM人数', fn: (iso) => skillOnDuty(iso, 'SV') },
  { label: 'TL人数', fn: (iso) => skillOnDuty(iso, 'TL') },
  { label: 'T2人数', fn: (iso) => skillOnDuty(iso, 'T2') },
  { label: 'T3人数', fn: (iso) => skillOnDuty(iso, 'T3') },
  ...['A06', 'A09', 'A21', 'A22', 'A23', 'A00', 'A01'].map((code) => ({
    label: `${code}一线人数`,
    fn: (iso) => codeCount(iso, code),
  })),
  { label: 'Trainee人数', fn: () => 0 },
  { label: 'Total Chat', fn: (iso) => skillOnDuty(iso, 'Chat') },
  { label: 'Total Call', fn: (iso) => skillOnDuty(iso, 'Call') },
];
tsLines.push('export const DAY_TOTALS_202610: DayTotalRow[] = [');
for (const row of totalRows) {
  const values = isos.map((iso) => `'${iso}': ${row.fn(iso)}`).join(', ');
  tsLines.push(`  { label: '${row.label}', values: { ${values} } },`);
}
tsLines.push('];');
tsLines.push('');
const tsPath = resolve(ROOT, 'src', 'data', 'roster-2026-10.ts');
writeFileSync(tsPath, tsLines.join('\n'), 'utf-8');
console.log(`wrote ${tsPath}`);

/* ---------------- 2. D1 SQL (roster_cells with off columns) ---------------- */
mkdirSync(OUT_DIR, { recursive: true });
const sqlLines = [
  // Self-healing columns (ALTER fails loudly if already applied — run once).
  `ALTER TABLE roster_cells ADD COLUMN off_hours REAL;`,
  `ALTER TABLE roster_cells ADD COLUMN off_note TEXT;`,
  `DELETE FROM roster_cells WHERE month_key = '${MONTH}';`,
];
const cellRows = agents.flatMap((a) =>
  Object.entries(a.shifts).map(([iso, code]) => ({
    en: a.en,
    iso,
    code,
    off: a.offHours?.[iso] ?? null,
    note: a.offNote?.[iso] ?? null,
  })),
);
for (let i = 0; i < cellRows.length; i += 40) {
  const part = cellRows.slice(i, i + 40);
  const values = part
    .map((r) =>
      `('${MONTH}', '${r.en.replace(/'/g, "''")}', '${r.iso}', '${r.code.replace(/'/g, "''")}', ` +
      `${r.off === null ? 'NULL' : r.off}, ${r.note === null ? 'NULL' : `'${r.note.replace(/'/g, "''")}'`}, datetime('now'))`)
    .join(', ');
  sqlLines.push(
    `INSERT INTO roster_cells (month_key, en, iso, code, off_hours, off_note, updated_at) VALUES ${values};`,
  );
}
writeFileSync(resolve(OUT_DIR, 'oct-offtime.sql'), sqlLines.join('\n'), 'utf-8');
console.log(`wrote .wrangler/tmp-roster/oct-offtime.sql (${cellRows.length} cells)`);
