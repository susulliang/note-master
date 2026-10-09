/**
 * Salesforce report exports loader (browser runtime).
 *
 * An external workflow drops automated report exports into the `sf_reports/`
 * folder. In dev the Vite middleware serves it and exposes a JSON directory
 * index at `/sf_reports/index.json`; the app picks the newest matching export
 * at runtime, so freshly exported files appear on Refresh without a rebuild.
 *
 * Parsing logic lives in `./report-parsers` (shared with the offline sync
 * script). This module only handles file discovery + download.
 */
import {
  parseCountByOwnerWorkbook,
  parseCsatWorkbook,
  parseHistoricalMetricsCsv,
  parseMtdCallDataCsv,
  parseOneTouchWorkbook,
  type CallMetrics,
  type CountReport,
  type CountRow,
  type CsatAgentRow,
  type CsatReport,
  type HistoricalMetricsReport,
  type OneTouchChannel,
  type OneTouchReport,
  type OneTouchRow,
} from './report-parsers';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

export interface SfReportFile {
  name: string;
  size: number;
  mtimeMs: number;
}

interface SfReportIndex {
  generatedAt: string;
  files: SfReportFile[];
}

export {
  type CallMetrics,
  type CountReport,
  type CountRow,
  type CsatAgentRow,
  type CsatReport,
  type HistoricalMetricsReport,
  type OneTouchChannel,
  type OneTouchReport,
  type OneTouchRow,
};

export async function fetchSfReportIndex(signal?: AbortSignal): Promise<SfReportFile[]> {
  const res = await fetch(`${BASE}sf_reports/index.json`, { signal });
  if (!res.ok) throw new Error(`sf_reports index failed: HTTP ${res.status}`);
  const data = (await res.json()) as Partial<SfReportIndex>;
  return Array.isArray(data.files) ? data.files : [];
}

/** Newest CSAT *.xlsx export. */
export function pickCsatExport(files: SfReportFile[]): SfReportFile | undefined {
  return files
    .filter((f) => /\.xlsx$/i.test(f.name) && /csat/i.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

/** Newest One-touch *.xlsx export. */
export function pickOneTouchExport(files: SfReportFile[]): SfReportFile | undefined {
  return files
    .filter((f) => /\.xlsx$/i.test(f.name) && /one[\s_-]*touch/i.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

/** Newest Chat Messaging *.xlsx export. */
export function pickChatExport(files: SfReportFile[]): SfReportFile | undefined {
  return files
    .filter((f) => /\.xlsx$/i.test(f.name) && /chat[\s_-]*messaging|messaging/i.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

/** Newest AMR Email *.xlsx export. */
export function pickEmailExport(files: SfReportFile[]): SfReportFile | undefined {
  return files
    .filter((f) => /\.xlsx$/i.test(f.name) && /amr[\s_-]*email|email/i.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

/** Newest MTD Call Data *.csv export. */
export function pickCallDataExport(files: SfReportFile[]): SfReportFile | undefined {
  return files
    .filter((f) => /\.csv$/i.test(f.name) && /mtd[\s_-]*call/i.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

/** Newest Historical Metrics *.csv export. */
export function pickHistoricalMetricsExport(files: SfReportFile[]): SfReportFile | undefined {
  return files
    .filter((f) => /\.csv$/i.test(f.name) && /historical[\s_-]*metrics/i.test(f.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

// ---------------------------------------------------------------------------
// Fetchers (download + parse)
// ---------------------------------------------------------------------------

export async function fetchCsatReport(file: SfReportFile, signal?: AbortSignal): Promise<CsatReport> {
  const res = await fetch(`${BASE}sf_reports/${encodeURIComponent(file.name)}`, { signal });
  if (!res.ok) throw new Error(`Failed to download ${file.name}: HTTP ${res.status}`);
  return parseCsatWorkbook(await res.arrayBuffer(), file.name);
}

export async function fetchOneTouchReport(file: SfReportFile, signal?: AbortSignal): Promise<OneTouchReport> {
  const res = await fetch(`${BASE}sf_reports/${encodeURIComponent(file.name)}`, { signal });
  if (!res.ok) throw new Error(`Failed to download ${file.name}: HTTP ${res.status}`);
  return parseOneTouchWorkbook(await res.arrayBuffer(), file.name);
}

export async function fetchChatReport(file: SfReportFile, signal?: AbortSignal): Promise<CountReport> {
  const res = await fetch(`${BASE}sf_reports/${encodeURIComponent(file.name)}`, { signal });
  if (!res.ok) throw new Error(`Failed to download ${file.name}: HTTP ${res.status}`);
  return parseCountByOwnerWorkbook(await res.arrayBuffer(), file.name, /Session Owner/);
}

export async function fetchEmailReport(file: SfReportFile, signal?: AbortSignal): Promise<CountReport> {
  const res = await fetch(`${BASE}sf_reports/${encodeURIComponent(file.name)}`, { signal });
  if (!res.ok) throw new Error(`Failed to download ${file.name}: HTTP ${res.status}`);
  return parseCountByOwnerWorkbook(await res.arrayBuffer(), file.name, /Created By/);
}

export async function fetchCsvReport(file: SfReportFile, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${BASE}sf_reports/${encodeURIComponent(file.name)}`, { signal });
  if (!res.ok) throw new Error(`Failed to download ${file.name}: HTTP ${res.status}`);
  return res.text();
}

export async function fetchCallReport(file: SfReportFile, signal?: AbortSignal): Promise<CallMetrics> {
  const text = await fetchCsvReport(file, signal);
  return parseMtdCallDataCsv(text, file.name);
}

export async function fetchHistoricalReport(file: SfReportFile, signal?: AbortSignal): Promise<HistoricalMetricsReport> {
  const text = await fetchCsvReport(file, signal);
  return parseHistoricalMetricsCsv(text, file.name);
}

// ---------------------------------------------------------------------------
// Pre-computed dashboard data (generated by scripts/sync-reports.ts)
// ---------------------------------------------------------------------------

export interface DashboardData {
  generatedAt: string;
  sources: Record<string, string>;
  csat?: CsatReport;
  oneTouch?: OneTouchReport;
  chat?: CountReport;
  email?: CountReport;
  call?: CallMetrics;
  historical?: HistoricalMetricsReport;
}

/**
 * Fetches the pre-parsed dashboard-data.json produced by `sync:reports`.
 * Returns null if the file is absent (the caller then falls back to runtime
 * parsing of the raw exports).
 */
export async function fetchDashboardData(signal?: AbortSignal): Promise<DashboardData | null> {
  try {
    const res = await fetch(`${BASE}sf_reports/dashboard-data.json`, { signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as DashboardData;
  } catch {
    return null;
  }
}
