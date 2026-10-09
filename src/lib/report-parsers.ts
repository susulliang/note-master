/**
 * Pure report parsers — no browser APIs, no fetch.
 *
 * Shared between the browser runtime (sf-reports.ts) and the offline sync
 * script (scripts/sync-reports.ts). Every parser takes raw bytes/text and
 * returns a typed report object. The only runtime dependency is `xlsx`.
 */
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function toPercent(v: unknown): number {
  if (typeof v === 'number') return v <= 1 ? v * 100 : v;
  const n = toNumber(v);
  return typeof v === 'string' && !v.includes('%') && n <= 1 ? n * 100 : n;
}

function extractAsOf(rows: unknown[][], scanRows = 24): string | null {
  for (const row of rows.slice(0, scanRows)) {
    for (const cell of row) {
      if (typeof cell === 'string' && /As of\s+/i.test(cell)) {
        const m = cell.match(/As of\s+(.+?)\s*[•*]\s*/i);
        return (m ? m[1] : cell.replace(/^.*?As of\s+/i, '')).trim();
      }
    }
  }
  return null;
}

function sheetRows(data: ArrayBuffer, nameTest: RegExp): { name: string; rows: unknown[][] } {
  const wb = XLSX.read(data, { type: 'array' });
  const name = wb.SheetNames.find((n) => nameTest.test(n)) ?? wb.SheetNames[0];
  if (!name) throw new Error('Workbook contains no sheets');
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet "${name}" is empty`);
  return {
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null }),
  };
}

function hmsToSeconds(s: string): number {
  const m = s.match(/(\d+):(\d+):(\d+)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// ---------------------------------------------------------------------------
// CSAT
// ---------------------------------------------------------------------------

export interface CsatAgentRow {
  owner: string;
  good: number;
  bad: number;
  csat: number;
  records: number;
}

export interface CsatReport {
  fileName: string;
  asOf: string | null;
  agents: CsatAgentRow[];
  total: CsatAgentRow;
}

type CsatHeaderKey = 'owner' | 'good' | 'bad' | 'csat' | 'records';

export function parseCsatWorkbook(data: ArrayBuffer, fileName: string): CsatReport {
  const { rows } = sheetRows(data, /csat/i);
  const asOf = extractAsOf(rows);

  const col: Record<CsatHeaderKey, number> = { owner: -1, good: -1, bad: -1, csat: -1, records: -1 };
  let headerRow = -1;
  rows.forEach((row, i) => {
    if (headerRow !== -1) return;
    const next = { ...col };
    row.forEach((cell, j) => {
      const t = String(cell ?? '').trim();
      if (/^Case Owner/.test(t)) next.owner = j;
      else if (/Good Satisfaction/i.test(t)) next.good = j;
      else if (/Bad Satisfaction/i.test(t)) next.bad = j;
      else if (t === 'CSAT') next.csat = j;
      else if (/Record Count/i.test(t)) next.records = j;
    });
    if (next.owner !== -1 && next.good !== -1 && next.bad !== -1 && next.csat !== -1) {
      Object.assign(col, next);
      headerRow = i;
    }
  });
  if (headerRow === -1) throw new Error('CSAT header row not found (expected Case Owner / Good / Bad / CSAT columns)');

  const agents: CsatAgentRow[] = [];
  let total: CsatAgentRow | null = null;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const owner = String(row[col.owner] ?? '').trim();
    if (!owner) continue;
    const parsed: CsatAgentRow = {
      owner,
      good: toNumber(row[col.good]),
      bad: toNumber(row[col.bad]),
      csat: toPercent(row[col.csat]),
      records: col.records !== -1 ? toNumber(row[col.records]) : 0,
    };
    if (/^total$/i.test(owner)) total = { ...parsed, owner: 'Total' };
    else agents.push(parsed);
  }
  if (agents.length === 0) throw new Error('No agent rows found in the CSAT sheet');
  if (!total) {
    const sum = agents.reduce((acc, a) => ({ good: acc.good + a.good, bad: acc.bad + a.bad, records: acc.records + a.records }), { good: 0, bad: 0, records: 0 });
    const surveyed = sum.good + sum.bad;
    total = { owner: 'Total', good: sum.good, bad: sum.bad, records: sum.records, csat: surveyed > 0 ? (sum.good / surveyed) * 100 : 0 };
  }
  return { fileName, asOf, agents, total };
}

// ---------------------------------------------------------------------------
// One-touch rate
// ---------------------------------------------------------------------------

export interface OneTouchChannel {
  name: string;
  rate: number;
  oneTime: number;
  closed: number;
}

export interface OneTouchRow {
  owner: string;
  rate: number;
  oneTime: number;
  closed: number;
  channels: OneTouchChannel[];
}

export interface OneTouchReport {
  fileName: string;
  asOf: string | null;
  agents: OneTouchRow[];
  total: OneTouchRow;
}

export function parseOneTouchWorkbook(data: ArrayBuffer, fileName: string): OneTouchReport {
  const { rows } = sheetRows(data, /one[\s_-]*touch/i);
  const asOf = extractAsOf(rows);

  const groupRowIdx = rows.findIndex((r) => r.some((c) => typeof c === 'string' && /Case Origin/.test(c)));
  if (groupRowIdx === -1) throw new Error('One-touch pivot header (Case Origin) not found');
  const groupRow = rows[groupRowIdx];
  const subRow = rows[groupRowIdx + 1] ?? [];
  const ownerCol = subRow.findIndex((c) => /^Case Owner/.test(String(c ?? '').trim()));
  if (ownerCol === -1) throw new Error('One-touch subheader (Case Owner) not found');

  const groups: { name: string; start: number }[] = [];
  groupRow.forEach((cell, j) => {
    const t = String(cell ?? '').trim();
    if (t && !/Case Origin/.test(t)) groups.push({ name: t, start: j });
  });

  const readRow = (raw: unknown[]): OneTouchRow | null => {
    const owner = String(raw[ownerCol] ?? '').trim();
    if (!owner) return null;
    const channels: OneTouchChannel[] = [];
    for (const g of groups) {
      if (/^total$/i.test(g.name)) continue;
      const closed = toNumber(raw[g.start + 2]);
      if (closed <= 0) continue;
      channels.push({ name: g.name, rate: toPercent(raw[g.start]), oneTime: toNumber(raw[g.start + 1]), closed });
    }
    const totalGroup = groups.find((g) => /^total$/i.test(g.name));
    const rate = totalGroup ? toPercent(raw[totalGroup.start]) : 0;
    const oneTime = totalGroup ? toNumber(raw[totalGroup.start + 1]) : 0;
    const closed = totalGroup ? toNumber(raw[totalGroup.start + 2]) : 0;
    return { owner, rate, oneTime, closed, channels };
  };

  const agents: OneTouchRow[] = [];
  let total: OneTouchRow | null = null;
  for (let i = groupRowIdx + 2; i < rows.length; i++) {
    const parsed = readRow(rows[i]);
    if (!parsed) continue;
    if (/^total$/i.test(parsed.owner)) total = { ...parsed, owner: 'Total' };
    else if (parsed.closed > 0) agents.push(parsed);
  }
  if (agents.length === 0) throw new Error('No agent rows found in the One-touch sheet');
  if (!total) {
    const sum = agents.reduce((acc, a) => ({ oneTime: acc.oneTime + a.oneTime, closed: acc.closed + a.closed }), { oneTime: 0, closed: 0 });
    total = { owner: 'Total', oneTime: sum.oneTime, closed: sum.closed, rate: sum.closed > 0 ? (sum.oneTime / sum.closed) * 100 : 0, channels: [] };
  }
  return { fileName, asOf, agents, total };
}

// ---------------------------------------------------------------------------
// Count-by-owner (Chat & Email)
// ---------------------------------------------------------------------------

export interface CountRow {
  owner: string;
  count: number;
}

export interface CountReport {
  fileName: string;
  asOf: string | null;
  agents: CountRow[];
  total: number;
}

export function parseCountByOwnerWorkbook(data: ArrayBuffer, fileName: string, ownerRe: RegExp): CountReport {
  const { rows } = sheetRows(data, ownerRe);
  const asOf = extractAsOf(rows);

  const headerIdx = rows.findIndex((r) =>
    r.some((c) => ownerRe.test(String(c ?? '').trim())) &&
    r.some((c) => /Record Count/i.test(String(c ?? '').trim())),
  );
  if (headerIdx === -1) throw new Error(`Owner + Record Count header not found in ${fileName}`);
  const header = rows[headerIdx];
  const ownerCol = header.findIndex((c) => ownerRe.test(String(c ?? '').trim()));
  const countCol = header.findIndex((c) => /Record Count|Count/i.test(String(c ?? '').trim()));
  if (ownerCol === -1 || countCol === -1) throw new Error(`Header columns not found in ${fileName}`);

  const agents: CountRow[] = [];
  let total = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const owner = String(rows[i][ownerCol] ?? '').trim();
    if (!owner) continue;
    const count = toNumber(rows[i][countCol]);
    if (/^total$/i.test(owner)) total = count;
    else if (count > 0) agents.push({ owner, count });
  }
  if (agents.length === 0) throw new Error(`No agent rows found in ${fileName}`);
  if (total === 0) total = agents.reduce((s, a) => s + a.count, 0);
  return { fileName, asOf, agents, total };
}

// ---------------------------------------------------------------------------
// Call data (CSV)
// ---------------------------------------------------------------------------

export interface CallMetrics {
  fileName: string;
  handled: number;
  handledOutbound: number;
  abandoned: number;
  serviceLevel20: number;
  avgHandleTimeSec: number;
}

export interface HistoricalQueue {
  queue: string;
  handled: number;
  handledIncoming: number;
  handledOutbound: number;
  abandoned: number;
  serviceLevel20: number;
  avgHandleTimeSec: number;
}

export interface HistoricalMetricsReport {
  fileName: string;
  queues: HistoricalQueue[];
}

export function parseMtdCallDataCsv(text: string, fileName: string): CallMetrics {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => /Contacts handled/.test(l));
  if (headerIdx === -1) throw new Error(`MTD Call Data header not found in ${fileName}`);
  const headers = lines[headerIdx]!.split(',');
  const values = lines[headerIdx + 1]?.split(',') ?? [];
  const get = (re: RegExp) => {
    const i = headers.findIndex((h) => re.test(h.trim()));
    return i !== -1 ? values[i] : '';
  };
  return {
    fileName,
    handled: toNumber(get(/^Contacts handled$/)),
    handledOutbound: toNumber(get(/Contacts handled outbound/)),
    abandoned: toNumber(get(/^Contacts abandoned$/)),
    serviceLevel20: toPercent(get(/^Service level 20 seconds$/)),
    avgHandleTimeSec: hmsToSeconds(get(/^Avg\. handle time$/)),
  };
}

export function parseHistoricalMetricsCsv(text: string, fileName: string): HistoricalMetricsReport {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => /^Queue,/.test(l));
  if (headerIdx === -1) throw new Error(`Historical Metrics header not found in ${fileName}`);
  const headers = lines[headerIdx]!.split(',');
  const get = (row: string[], re: RegExp) => {
    const i = headers.findIndex((h) => re.test(h.trim()));
    return i !== -1 ? row[i] : '';
  };
  const queues: HistoricalQueue[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i]!.split(',');
    const queue = row[0]?.trim();
    if (!queue) continue;
    queues.push({
      queue,
      handled: toNumber(get(row, /^Contacts handled$/)),
      handledIncoming: toNumber(get(row, /Contacts handled incoming/)),
      handledOutbound: toNumber(get(row, /Contacts handled outbound/)),
      abandoned: toNumber(get(row, /Contacts abandoned/)),
      serviceLevel20: toPercent(get(row, /Service level 20 seconds/)),
      avgHandleTimeSec: toNumber(get(row, /Average handle time/)),
    });
  }
  return { fileName, queues };
}
