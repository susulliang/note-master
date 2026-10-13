/**
 * sync-reports.ts — translate the raw Salesforce exports in sf_reports/ into
 * a single widget-ready JSON blob consumed by the dashboard.
 *
 * Run whenever a new report is exported from the SF system:
 *   npm run sync:reports          # all report types
 *   npx tsx scripts/sync-reports.ts
 *
 * Output: dashboard_publish/dashboard-data.json with sections: csat, oneTouch,
 * chat, email, call, historical. The dashboard hooks fetch this JSON for
 * instant load after publishing; local development can still parse exports.
 *
 * Parsing functions are shared with the browser (src/lib/report-parsers.ts).
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  callMetricsFromHistorical,
  parseCountByOwnerWorkbook,
  parseCsatWorkbook,
  parseChatResponseTimeWorkbook,
  parseDsatsWorkbook,
  parseEmailAvgResponseWorkbook,
  parseEmailFirstResponseWorkbook,
  parseHistoricalMetricsCsv,
  parseOneTouchWorkbook,
} from '../src/lib/report-parsers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORTS_DIR = resolve(ROOT, 'sf_reports');
const OUT = process.env.DASHBOARD_DATA_OUTPUT
  ? resolve(ROOT, process.env.DASHBOARD_DATA_OUTPUT)
  : resolve(ROOT, 'dashboard_publish/dashboard-data.json');

interface ReportFile {
  name: string;
  size: number;
  mtimeMs: number;
  exportTimeMs: number | null;
}

function filenameTimestamp(name: string): number | null {
  const match = name.match(/(\d{4}-\d{2}-\d{2})[-_ ](\d{2})[-:](\d{2})[-:](\d{2})/);
  if (!match) return null;
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
}

/** Files in sf_reports/ sorted newest-first. */
function listReports(): ReportFile[] {
  return readdirSync(REPORTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.') && e.name !== 'dashboard-data.json')
    .map((e) => {
      const st = statSync(resolve(REPORTS_DIR, e.name));
      return { name: e.name, size: st.size, mtimeMs: st.mtimeMs, exportTimeMs: filenameTimestamp(e.name) };
    })
    .sort((a, b) => {
      if (a.exportTimeMs !== null && b.exportTimeMs !== null) return b.exportTimeMs - a.exportTimeMs;
      if (a.exportTimeMs !== null) return -1;
      if (b.exportTimeMs !== null) return 1;
      return b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name);
    });
}

const pick = (files: ReportFile[], re: RegExp) => files.find((f) => re.test(f.name));
const readBuf = (name: string): ArrayBuffer => {
  const buf = readFileSync(resolve(REPORTS_DIR, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const readText = (name: string) => readFileSync(resolve(REPORTS_DIR, name), 'utf-8');

const files = listReports();
mkdirSync(dirname(OUT), { recursive: true });
console.log(`Found ${files.length} report file(s) in sf_reports/`);

const out: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  sources: {} as Record<string, string>,
};

// Keep the scorecard outside the frontend bundle; publish it with the report
// snapshot so data refreshes do not require an app rebuild.
const moneyGoHigh = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/money-go-high.json'), 'utf-8'),
) as {
  kpis?: Array<{ name?: string; score?: number }>;
  totalScore?: number;
  source?: { sheetName?: string; revision?: number };
};
if (
  !Array.isArray(moneyGoHigh.kpis)
  || moneyGoHigh.kpis.length === 0
  || moneyGoHigh.kpis.some((row) => !row.name || !Number.isFinite(row.score))
  || !Number.isFinite(moneyGoHigh.totalScore)
) {
  throw new Error('Invalid Money Go High data in scripts/money-go-high.json');
}
const scoreSum = moneyGoHigh.kpis.reduce((sum, row) => sum + (row.score ?? 0), 0);
if (Math.abs(scoreSum - moneyGoHigh.totalScore!) > 0.01) {
  throw new Error(
    `Money Go High score mismatch: KPI rows sum to ${scoreSum.toFixed(2)}, supplied total is ${moneyGoHigh.totalScore}`,
  );
}
out.moneyGoHigh = moneyGoHigh;
(out.sources as Record<string, string>).moneyGoHigh =
  `${moneyGoHigh.source?.sheetName ?? 'Money Go High'} (revision ${moneyGoHigh.source?.revision ?? 'unknown'})`;
console.log(
  `  KPI   <- ${moneyGoHigh.source?.sheetName ?? 'Money Go High'} (${moneyGoHigh.kpis.length} KPIs, ${moneyGoHigh.totalScore!.toFixed(2)} pts)`,
);

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
// Require the "AMR Email" prefix so the standalone "Avg Response Time...email"
// exports aren't mistaken for the volume report (those feed a future widget).
const emailFile = pick(files, /amr[\s_-]*email.*\.xlsx$/i);
if (emailFile) {
  const r = parseCountByOwnerWorkbook(readBuf(emailFile.name), emailFile.name, /Created By/);
  out.email = r;
  (out.sources as Record<string, string>).email = emailFile.name;
  console.log(`  Email <- ${emailFile.name} (${r.agents.length} agents, ${r.total} total)`);
} else console.warn('  Email : no matching .xlsx found');

// --- Historical metrics (also feeds the call section) ---
const histFile = pick(files, /historical[\s_-]*metrics.*\.csv$/i);
if (histFile) {
  const r = parseHistoricalMetricsCsv(readText(histFile.name), histFile.name);
  out.historical = r;
  (out.sources as Record<string, string>).historical = histFile.name;
  console.log(`  Hist  <- ${histFile.name} (${r.agents.length} agents, ${r.queues.length} queues)`);
  // Team call aggregates now derive from the same report's agent rows —
  // MTD Call Data.csv is retired from the routine.
  const call = callMetricsFromHistorical(r);
  out.call = call;
  (out.sources as Record<string, string>).call = `${histFile.name} (agent rows)`;
  console.log(`  Call  <- ${histFile.name} agent rows (${call.handled} handled, SL ${call.serviceLevel20.toFixed(1)}%)`);
} else console.warn('  Hist  : no matching .csv found');

// --- DSAT (dissatisfaction cases) ---
const dsatsFile = pick(files, /^dsat.*\.xlsx$/i);
if (dsatsFile) {
  const r = parseDsatsWorkbook(readBuf(dsatsFile.name), dsatsFile.name);
  out.dsats = r;
  (out.sources as Record<string, string>).dsats = dsatsFile.name;
  console.log(`  DSAT  <- ${dsatsFile.name} (${r.total} dissatisfied cases)`);
} else console.warn('  DSAT  : no matching DSAT .xlsx found');

// --- Response time: Chat avg response (seconds) ---
// Match "Average response time ... Chat" but NOT the email files.
// Match "Average response time ... Chat" — note "Average" (not "avg") so the
// email "Avg Response Time" files don't collide.
const chatRtFile = pick(files, /average[\s_-]*response.*chat|chat.*average[\s_-]*response/i);
if (chatRtFile) {
  const r = parseChatResponseTimeWorkbook(readBuf(chatRtFile.name), chatRtFile.name);
  out.chatResponse = r;
  (out.sources as Record<string, string>).chatResponse = chatRtFile.name;
  console.log(
    `  ChRT  <- ${chatRtFile.name} (team ${r.teamAvg.toFixed(1)}s, agent ${r.agentAvg.toFixed(1)}s, thr ${r.threshold}s)`,
  );
} else console.warn('  ChRT  : no matching Chat response-time .xlsx found');

// --- Response time: Email first response (hours) ---
const emailFirstRtFile = pick(files, /first[\s_-]*response.*email|email.*first[\s_-]*response/i);
if (emailFirstRtFile) {
  const r = parseEmailFirstResponseWorkbook(readBuf(emailFirstRtFile.name), emailFirstRtFile.name);
  out.emailFirstResponse = r;
  (out.sources as Record<string, string>).emailFirstResponse = emailFirstRtFile.name;
  console.log(
    `  E1RT  <- ${emailFirstRtFile.name} (team ${r.teamAvg.toFixed(2)}h, agent ${r.agentAvg.toFixed(2)}h, thr ${r.threshold}h)`,
  );
} else console.warn('  E1RT  : no matching Email first-response .xlsx found');

// --- Response time: Email average response (hours) ---
// Match "Avg Response Time ... email" but not "first".
const emailAvgRtFile = pick(
  files,
  /^(?=.*email)(?=.*avg[\s_-]*response)(?!.*first).*\.xlsx$/i,
);
if (emailAvgRtFile) {
  const r = parseEmailAvgResponseWorkbook(readBuf(emailAvgRtFile.name), emailAvgRtFile.name);
  out.emailAvgResponse = r;
  (out.sources as Record<string, string>).emailAvgResponse = emailAvgRtFile.name;
  console.log(
    `  EaRT  <- ${emailAvgRtFile.name} (team ${r.teamAvg.toFixed(2)}h, agent ${r.agentAvg.toFixed(2)}h, thr ${r.threshold}h)`,
  );
} else console.warn('  EaRT  : no matching Email avg-response .xlsx found');

if (process.env.REQUIRE_COMPLETE_DASHBOARD_DATA === '1') {
  const required = ['csat', 'oneTouch', 'chat', 'email', 'call', 'historical', 'chatResponse', 'emailFirstResponse', 'emailAvgResponse', 'dsats', 'moneyGoHigh'];
  const missing = required.filter((key) => !(key in out));
  if (missing.length) {
    throw new Error(`Refusing to publish an incomplete dashboard snapshot. Missing: ${missing.join(', ')}`);
  }
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`\nWrote ${relative(ROOT, OUT)}`);
