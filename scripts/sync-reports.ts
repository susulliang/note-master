/**
 * sync-reports.ts — translate the raw Salesforce exports in sf_reports/ into
 * a single widget-ready JSON blob consumed by the dashboard.
 *
 * Run whenever a new report is exported from the SF system:
 *   npm run sync:reports          # all report types
 *   npx tsx scripts/sync-reports.ts
 *
 * Output: sf_reports/dashboard-data.json with sections: csat, oneTouch,
 * chat, email, call, historical. The dashboard hooks fetch this JSON for
 * instant load; if it's missing they fall back to client-side parsing.
 *
 * Parsing functions are shared with the browser (src/lib/report-parsers.ts).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCountByOwnerWorkbook,
  parseCsatWorkbook,
  parseHistoricalMetricsCsv,
  parseMtdCallDataCsv,
  parseOneTouchWorkbook,
} from '../src/lib/report-parsers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORTS_DIR = resolve(ROOT, 'sf_reports');
const OUT = resolve(REPORTS_DIR, 'dashboard-data.json');

interface ReportFile {
  name: string;
  size: number;
  mtimeMs: number;
}

/** Files in sf_reports/ sorted newest-first. */
function listReports(): ReportFile[] {
  return readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.') && e.name !== 'dashboard-data.json')
    .map((e) => {
      const st = statSync(resolve(REPORTS_DIR, e.name));
      return { name: e.name, size: st.size, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

const pick = (files: ReportFile[], re: RegExp) => files.find((f) => re.test(f.name));
const readBuf = (name: string): ArrayBuffer => {
  const buf = readFileSync(resolve(REPORTS_DIR, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const readText = (name: string) => readFileSync(resolve(REPORTS_DIR, name), 'utf-8');

const files = listReports();
console.log(`Found ${files.length} report file(s) in sf_reports/`);

const out: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  sources: {} as Record<string, string>,
};

// --- CSAT ---
const csatFile = pick(files, /csat.*\.xlsx$/i);
if (csatFile) {
  const r = parseCsatWorkbook(readBuf(csatFile.name), csatFile.name);
  out.csat = r;
  (out.sources as Record<string, string>).csat = csatFile.name;
  console.log(`  CSAT  <- ${csatFile.name} (${r.agents.length} agents, ${r.total.csat.toFixed(1)}%)`);
} else console.warn('  CSAT  : no matching .xlsx found');

// --- One Touch ---
const touchFile = pick(files, /one[\s_-]*touch.*\.xlsx$/i);
if (touchFile) {
  const r = parseOneTouchWorkbook(readBuf(touchFile.name), touchFile.name);
  out.oneTouch = r;
  (out.sources as Record<string, string>).oneTouch = touchFile.name;
  console.log(`  Touch <- ${touchFile.name} (${r.agents.length} agents, ${r.total.rate.toFixed(1)}%)`);
} else console.warn('  Touch : no matching .xlsx found');

// --- Chat ---
const chatFile = pick(files, /(chat[\s_-]*messaging|messaging).*\.xlsx$/i);
if (chatFile) {
  const r = parseCountByOwnerWorkbook(readBuf(chatFile.name), chatFile.name, /Session Owner/);
  out.chat = r;
  (out.sources as Record<string, string>).chat = chatFile.name;
  console.log(`  Chat  <- ${chatFile.name} (${r.agents.length} agents, ${r.total} total)`);
} else console.warn('  Chat  : no matching .xlsx found');

// --- Email ---
const emailFile = pick(files, /(amr[\s_-]*email|email).*\.xlsx$/i);
if (emailFile) {
  const r = parseCountByOwnerWorkbook(readBuf(emailFile.name), emailFile.name, /Created By/);
  out.email = r;
  (out.sources as Record<string, string>).email = emailFile.name;
  console.log(`  Email <- ${emailFile.name} (${r.agents.length} agents, ${r.total} total)`);
} else console.warn('  Email : no matching .xlsx found');

// --- Call data ---
const callFile = pick(files, /mtd[\s_-]*call.*\.csv$/i);
if (callFile) {
  const r = parseMtdCallDataCsv(readText(callFile.name), callFile.name);
  out.call = r;
  (out.sources as Record<string, string>).call = callFile.name;
  console.log(`  Call  <- ${callFile.name} (${r.handled} handled, SL ${r.serviceLevel20.toFixed(1)}%)`);
} else console.warn('  Call  : no matching .csv found');

// --- Historical metrics ---
const histFile = pick(files, /historical[\s_-]*metrics.*\.csv$/i);
if (histFile) {
  const r = parseHistoricalMetricsCsv(readText(histFile.name), histFile.name);
  out.historical = r;
  (out.sources as Record<string, string>).historical = histFile.name;
  console.log(`  Hist  <- ${histFile.name} (${r.queues.length} queues)`);
} else console.warn('  Hist  : no matching .csv found');

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`\nWrote ${OUT.replace(ROOT + '/', '')}`);
