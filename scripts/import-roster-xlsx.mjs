/**
 * tmp-import-nov-roster.mjs — one-off: import the official November 2026
 * roster workbook (GZ-OPS-Ecovacs NA Roster November 2026 v2.xlsx) into:
 *   1. src/data/roster-2026-11.ts  (baked offline fallback, ROSTER_202611
 *      + DAY_TOTALS_202611 regenerated)
 *   2. .wrangler/tmp-roster/nov-full.json   → POST /api/roster (RosterRoom DO)
 *   3. .wrangler/tmp-roster/nov-d1.sql      → D1 roster_cells backup
 *
 * Sheet layout (Sheet1): row 2 = headers (7 meta cols + weekday names),
 * row 3 = day numbers 26..31 (Oct) + 1..30 (Nov), row 4+ = agents
 * (EN in col 4, Main Skill col 5, shifts col 8+). Summary rows below the
 * agents have an empty Main Skill cell.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const XLSX_PATH = resolve(ROOT, 'GZ-OPS-Ecovacs NA Roster November 2026 v2.xlsx');
const OUT_DIR = resolve(ROOT, '.wrangler', 'tmp-roster');

const YEAR = 2026;
const MONTH = 11;
const DAYS = 30;
const OFF_CODES = new Set(['OFF', 'PH', 'AL', '调休', '病假', '事假']);
/** Day-column index → ISO date. Index 0-5 = Oct 26-31, 6-35 = Nov 1-30. */
function isoForCol(d) {
  if (d <= 5) return `2026-10-${String(26 + d).padStart(2, '0')}`;
  return `2026-11-${String(d - 5).padStart(2, '0')}`;
}

const buf = readFileSync(XLSX_PATH);
const wb = XLSX.read(buf, { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '', blankrows: false });

/** M/D/YY → YYYY/M/D (matches the existing baked files). */
function normalizeDate(raw) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(String(raw).trim());
  if (!m) return String(raw).trim();
  return `20${m[3]}/${Number(m[1])}/${Number(m[2])}`;
}

const agents = [];
for (let i = 3; i < rows.length; i++) {
  const r = rows[i];
  const en = String(r[3] ?? '').trim();
  const skill = String(r[4] ?? '').trim();
  if (!en || !skill) continue; // summary rows have no Main Skill
  const shifts = {};
  for (let d = 0; d < 36; d++) {
    const iso = isoForCol(d);
    if (!iso.startsWith('2026-11')) continue; // baked file covers November only
    shifts[iso] = String(r[7 + d] ?? '').trim();
  }
  agents.push({
    no: String(agents.length + 1),
    hr: String(r[1] ?? '').trim(),
    zh: String(r[2] ?? '').trim(),
    en,
    skill,
    hired: normalizeDate(r[5]),
    joined: normalizeDate(r[6]),
    offPh: String(Object.values(shifts).filter((c) => OFF_CODES.has(c)).length),
    bhc: '',
    phc: '',
    shifts,
  });
}
console.log(`parsed ${agents.length} agents`);
if (agents.length < 30) throw new Error('Suspiciously few agents — aborting');
// Guard: the day-number header row must agree with the column mapping.
const dayHeader = rows[2].slice(7, 43).map((v) => Number(String(v).trim()));
for (let d = 0; d < 36; d++) {
  const expected = d <= 5 ? 26 + d : d - 5;
  if (dayHeader[d] !== expected) throw new Error(`Day-number mismatch at col ${d}: sheet=${dayHeader[d]} expected=${expected}`);
}
for (const a of agents) {
  if (Object.keys(a.shifts).length !== DAYS) throw new Error(`${a.en} has ${Object.keys(a.shifts).length} Nov days`);
}

/* ---------------- 1. baked roster-2026-11.ts ---------------- */
const tsLines = [];
tsLines.push('/**');
tsLines.push(' * AMR NA Roster — 2026-11 — imported from the official workbook');
tsLines.push(' * "GZ-OPS-Ecovacs NA Roster November 2026 v2.xlsx" (baked offline');
tsLines.push(' * fallback; the RosterRoom DO is the first line, D1 roster_cells the');
tsLines.push(' * backup). Snapshot: ' + new Date().toISOString().slice(0, 10) + '.');
tsLines.push(' */');
tsLines.push('');
tsLines.push("import type { RosterAgent, DayTotalRow } from './roster';");
tsLines.push('');
tsLines.push('export const ROSTER_202611: RosterAgent[] = [');
for (const a of agents) {
  const shiftEntries = Object.entries(a.shifts)
    .map(([d, c]) => `'${d}': '${c.replace(/'/g, "\\'")}'`)
    .join(', ');
  tsLines.push(`  { no: '${a.no}', hr: '${a.hr}', zh: '${a.zh}', en: "${a.en}", skill: '${a.skill}', hired: '${a.hired}', joined: '${a.joined}', offPh: '${a.offPh}', bhc: '${a.bhc}', phc: '${a.phc}',`);
  tsLines.push(`    shifts: { ${shiftEntries} } },`);
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
tsLines.push('export const DAY_TOTALS_202611: DayTotalRow[] = [');
for (const row of totalRows) {
  const values = isos.map((iso) => `'${iso}': ${row.fn(iso)}`).join(', ');
  tsLines.push(`  { label: '${row.label}', values: { ${values} } },`);
}
tsLines.push('];');
tsLines.push('');
const tsPath = resolve(ROOT, 'src', 'data', 'roster-2026-11.ts');
writeFileSync(tsPath, tsLines.join('\n'), 'utf-8');
console.log(`wrote ${tsPath}`);

/* ---------------- 2+3. DO payload + D1 SQL ---------------- */
mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  month: '2026-11',
  mode: 'full',
  agents: agents.map((a) => ({
    en: a.en,
    shifts: Object.fromEntries(Object.entries(a.shifts).filter(([, code]) => code)),
  })),
};
writeFileSync(resolve(OUT_DIR, 'nov-full.json'), JSON.stringify(payload), 'utf-8');
console.log(`wrote .wrangler/tmp-roster/nov-full.json (${agents.length} agents)`);

const sqlLines = [`DELETE FROM roster_cells WHERE month_key = '2026-11';`];
const cellRows = agents.flatMap((a) => Object.entries(a.shifts).filter(([, code]) => code).map(([iso, code]) => ({ en: a.en, iso, code })));
for (let i = 0; i < cellRows.length; i += 40) {
  const part = cellRows.slice(i, i + 40);
  const values = part
    .map((r) => `('2026-11', '${r.en.replace(/'/g, "''")}', '${r.iso}', '${r.code.replace(/'/g, "''")}', datetime('now'))`)
    .join(', ');
  sqlLines.push(`INSERT INTO roster_cells (month_key, en, iso, code, updated_at) VALUES ${values};`);
}
writeFileSync(resolve(OUT_DIR, 'nov-d1.sql'), sqlLines.join('\n'), 'utf-8');
console.log(`wrote .wrangler/tmp-roster/nov-d1.sql (${cellRows.length} cells)`);
