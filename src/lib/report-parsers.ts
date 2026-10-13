/**
 * Pure report parsers — no browser APIs, no fetch.
 *
 * Shared between the browser runtime (sf-reports.ts) and the offline sync
 * script (scripts/sync-reports.ts). Every parser takes raw bytes/text and
 * returns a typed report object. The only runtime dependency is `xlsx`.
 */
import * as XLSX from 'xlsx';
import { THRESHOLDS } from './kpi-thresholds';

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

function toOptionalNumber(v: unknown): number | null {
  if (v == null || String(v).trim() === '') return null;
  return toNumber(v);
}

function toOptionalPercent(v: unknown): number | null {
  if (v == null || String(v).trim() === '') return null;
  return toPercent(v);
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

  // Anchor on the subheader row itself: the cell is exactly "Case Owner",
  // optionally with a sort arrow. Filter lines like "Case Owner contains ..."
  // and "Case Origin not equal to ..." must not match.
  const isOwnerHeader = (c: unknown) => /^Case Owner\s*[↑↓⇅]?$/.test(String(c ?? '').trim());
  const subRowIdx = rows.findIndex((r) => r.some(isOwnerHeader));
  if (subRowIdx === -1 || subRowIdx === 0) throw new Error('One-touch subheader (Case Owner) not found');
  const groupRow = rows[subRowIdx - 1] ?? [];
  const subRow = rows[subRowIdx];
  const ownerCol = subRow.findIndex(isOwnerHeader);

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
  for (let i = subRowIdx + 1; i < rows.length; i++) {
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
  serviceLevel20: number | null;
  avgHandleTimeSec: number | null;
}

export interface HistoricalAgent {
  owner: string;
  queues: string[];
  handled: number;
  handledIncoming: number;
  handledOutbound: number;
  missed: number;
  answerRate: number | null;
  serviceLevel20: number | null;
  avgIncomingConnectSec: number | null;
  avgHandleTimeSec: number | null;
}

export interface HistoricalMetricsReport {
  fileName: string;
  queues: HistoricalQueue[];
  agents: HistoricalAgent[];
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
  const workbook = XLSX.read(text, { type: 'string', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) throw new Error(`Historical Metrics sheet not found in ${fileName}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  const headerIdx = rows.findIndex((row) => row.some((cell) => /^Agent$/i.test(String(cell ?? '').trim())));
  if (headerIdx === -1) throw new Error(`Historical Metrics header not found in ${fileName}`);
  const headers = rows[headerIdx]!.map((cell) => String(cell ?? '').trim().replace(/^\uFEFF/, ''));
  const col = (re: RegExp) => headers.findIndex((header) => re.test(header));
  const cols = {
    agent: col(/^Agent$/i),
    queue: col(/^Queue$/i),
    name: col(/^Agent Name$/i),
    answerRate: col(/^Agent answer rate$/i),
    incomingConnect: col(/^Average agent incoming connecting time$/i),
    missed: col(/^Contacts missed$/i),
    serviceLevel20: col(/^Service level 20 seconds$/i),
    handled: col(/^Contacts handled$/i),
    handledIncoming: col(/^Contacts handled incoming$/i),
    handledOutbound: col(/^Contacts handled outbound$/i),
    avgHandleTime: col(/^Average handle time$/i),
  };
  if (cols.agent === -1 || cols.queue === -1 || cols.name === -1) {
    throw new Error(`Historical Metrics agent columns not found in ${fileName}`);
  }
  const value = (row: unknown[], index: number) => index === -1 ? null : row[index];
  const displayName = (nameValue: unknown, login: string) => {
    const name = String(nameValue ?? '').trim();
    if (!name) {
      return login.split('@')[0]!.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const comma = name.indexOf(',');
    if (comma === -1) return name;
    const last = name.slice(0, comma).trim();
    const first = name.slice(comma + 1).trim();
    if (!first) return last;
    if (!last || last.toLocaleLowerCase() === first.toLocaleLowerCase()) return first;
    return `${first} ${last}`;
  };
  type WeightedMetric = { total: number; weight: number };
  type AgentAccumulator = {
    owner: string;
    queues: Set<string>;
    handled: number;
    handledIncoming: number;
    handledOutbound: number;
    missed: number;
    answerRate: WeightedMetric;
    serviceLevel20: WeightedMetric;
    avgIncomingConnectSec: WeightedMetric;
    avgHandleTimeSec: WeightedMetric;
  };
  const addWeighted = (target: WeightedMetric, metric: number | null, weight: number) => {
    if (metric === null) return;
    const safeWeight = weight > 0 ? weight : 1;
    target.total += metric * safeWeight;
    target.weight += safeWeight;
  };
  const mean = (metric: WeightedMetric) => metric.weight > 0 ? metric.total / metric.weight : null;
  const queues: HistoricalQueue[] = [];
  const agents = new Map<string, AgentAccumulator>();
  for (const row of rows.slice(headerIdx + 1)) {
    const login = String(value(row, cols.agent) ?? '').trim();
    const queue = String(value(row, cols.queue) ?? '').trim();
    if (!login && !queue) continue;
    const handled = toNumber(value(row, cols.handled));
    const handledIncoming = toNumber(value(row, cols.handledIncoming));
    const handledOutbound = toNumber(value(row, cols.handledOutbound));
    const missed = toNumber(value(row, cols.missed));
    const answerRate = toOptionalPercent(value(row, cols.answerRate));
    const serviceLevel20 = toOptionalPercent(value(row, cols.serviceLevel20));
    const avgIncomingConnectSec = toOptionalNumber(value(row, cols.incomingConnect));
    const avgHandleTimeSec = toOptionalNumber(value(row, cols.avgHandleTime));

    if (!login) {
      queues.push({
        queue,
        handled,
        handledIncoming,
        handledOutbound,
        abandoned: toNumber(value(row, col(/^Contacts abandoned$/i))),
        serviceLevel20,
        avgHandleTimeSec,
      });
      continue;
    }

    const key = login.toLocaleLowerCase();
    let agent = agents.get(key);
    if (!agent) {
      agent = {
        owner: displayName(value(row, cols.name), login),
        queues: new Set<string>(),
        handled: 0,
        handledIncoming: 0,
        handledOutbound: 0,
        missed: 0,
        answerRate: { total: 0, weight: 0 },
        serviceLevel20: { total: 0, weight: 0 },
        avgIncomingConnectSec: { total: 0, weight: 0 },
        avgHandleTimeSec: { total: 0, weight: 0 },
      };
      agents.set(key, agent);
    }
    if (queue) agent.queues.add(queue);
    agent.handled += handled;
    agent.handledIncoming += handledIncoming;
    agent.handledOutbound += handledOutbound;
    agent.missed += missed;
    addWeighted(agent.answerRate, answerRate, handledIncoming + missed || handled + missed);
    addWeighted(agent.serviceLevel20, serviceLevel20, handledIncoming);
    addWeighted(agent.avgIncomingConnectSec, avgIncomingConnectSec, handledIncoming);
    addWeighted(agent.avgHandleTimeSec, avgHandleTimeSec, handled);
  }

  const parsedAgents = [...agents.values()]
    .filter((agent) => agent.handled + agent.missed > 0 || agent.answerRate.weight > 0 || agent.serviceLevel20.weight > 0)
    .map((agent) => ({
      owner: agent.owner,
      queues: [...agent.queues].sort((a, b) => a.localeCompare(b)),
      handled: agent.handled,
      handledIncoming: agent.handledIncoming,
      handledOutbound: agent.handledOutbound,
      missed: agent.missed,
      answerRate: mean(agent.answerRate),
      serviceLevel20: mean(agent.serviceLevel20),
      avgIncomingConnectSec: mean(agent.avgIncomingConnectSec),
      avgHandleTimeSec: mean(agent.avgHandleTimeSec),
    }))
    .sort((a, b) => a.owner.localeCompare(b.owner));

  if (parsedAgents.length === 0) throw new Error(`No agent metrics found in ${fileName}`);
  return { fileName, queues, agents: parsedAgents };
}

// ---------------------------------------------------------------------------
// DSAT (dissatisfaction cases, excludes DTC + other regions)
// ---------------------------------------------------------------------------

export interface DsatsCase {
  caseNumber: string;
  owner: string;
  model: string;
  issueType: string;
  /** Sanitized description snippet — emails redacted, whitespace collapsed. */
  description: string;
  /** 'Chat' / 'Email' / 'Phone', joined with " / " when several apply. */
  channel: string;
  status: string;
}

export interface DsatsReport {
  fileName: string;
  asOf: string | null;
  cases: DsatsCase[];
  total: number;
}

function sanitizeDsatsDescription(raw: string): string {
  const cleaned = raw
    .replace(/<mailto:[^>]+>/gi, ' ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.:-]+/g, '[email]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 220 ? `${cleaned.slice(0, 217).trimEnd()}…` : cleaned;
}

export function parseDsatsWorkbook(data: ArrayBuffer, fileName: string): DsatsReport {
  const { rows } = sheetRows(data, /dsat/i);
  const asOf = extractAsOf(rows);

  const stripSortArrow = (c: unknown) => String(c ?? '').trim().replace(/\s*[↑↓].*$/, '');
  const headerIdx = rows.findIndex(
    (r) => r.some((c) => /^Case Owner$/i.test(stripSortArrow(c)))
      && r.some((c) => /^Case Number$/i.test(stripSortArrow(c))),
  );
  if (headerIdx === -1) throw new Error(`DSAT header row not found in ${fileName}`);
  const header = rows[headerIdx]!.map(stripSortArrow);
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cols = {
    owner: col(/^Case Owner$/i),
    caseNumber: col(/^Case Number$/i),
    model: col(/^AMR Model No\.?$/i),
    issueType: col(/^Issue Type1 Second Classification$/i),
    description: col(/^Description$/i),
    chatResult: col(/^Chat Satisfaction Result$/i),
    emailResult: col(/^Email CSAT Survey Result$/i),
    phoneResult: col(/^Phone Survey Result/i),
    status: col(/^Status$/i),
  };
  if (cols.owner === -1 || cols.caseNumber === -1) throw new Error(`DSAT owner/case columns not found in ${fileName}`);

  const cases: DsatsCase[] = [];
  let lastOwner = '';
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const caseNumber = String(row[cols.caseNumber] ?? '').trim();
    const ownerCell = String(row[cols.owner] ?? '').trim();
    // Salesforce groups repeat owners; blank owner cells continue the previous group.
    if (ownerCell && !/^total$/i.test(ownerCell)) lastOwner = ownerCell;
    if (!caseNumber || !/^\d{6,}$/.test(caseNumber)) continue; // skips blank pads and the Total footer
    const channels = [
      cols.chatResult !== -1 && String(row[cols.chatResult] ?? '').trim() ? 'Chat' : null,
      cols.emailResult !== -1 && String(row[cols.emailResult] ?? '').trim() ? 'Email' : null,
      cols.phoneResult !== -1 && String(row[cols.phoneResult] ?? '').trim() ? 'Phone' : null,
    ].filter((c): c is string => Boolean(c));
    cases.push({
      caseNumber,
      owner: lastOwner,
      model: String(row[cols.model] ?? '').trim() || 'Unknown model',
      issueType: String(row[cols.issueType] ?? '').trim() || 'Unclassified',
      description: sanitizeDsatsDescription(String(row[cols.description] ?? '')),
      channel: channels.join(' / ') || 'Unknown',
      status: String(row[cols.status] ?? '').trim() || '—',
    });
  }
  if (cases.length === 0) throw new Error(`No DSAT case rows found in ${fileName}`);
  return { fileName, asOf, cases, total: cases.length };
}

// ---------------------------------------------------------------------------
// Average response time (Chat + Email first / Email avg)
// ---------------------------------------------------------------------------

export interface ResponseTimeAgent {
  owner: string;
  /** Response time in the report's native unit (seconds for chat, hours for email). */
  value: number;
  /** Record / chat count for weighting (0 when the export doesn't expose it). */
  count: number;
}

export interface ResponseTimeReport {
  fileName: string;
  asOf: string | null;
  metric: 'chat' | 'emailFirst' | 'emailAvg';
  unit: 'seconds' | 'hours';
  threshold: number;
  agents: ResponseTimeAgent[];
  /** Weighted team average (Total row, or count-weighted mean of agents). */
  teamAvg: number;
  /** Unweighted mean of per-agent averages — the typical agent's performance. */
  agentAvg: number;
}

interface RtConfig {
  metric: ResponseTimeReport['metric'];
  unit: ResponseTimeReport['unit'];
  threshold: number;
  valueHeaderRe: RegExp;
  countHeaderRe?: RegExp;
}

/**
 * Generic parser for the three "average response time" exports. Each is a
 * simple Case Owner → numeric average pivot, optionally with a record-count
 * column and a Total row. The Total row's value is used as `teamAvg`; the
 * mean of agent rows is `agentAvg`.
 */
export function parseResponseTimeWorkbook(
  data: ArrayBuffer,
  fileName: string,
  config: RtConfig,
): ResponseTimeReport {
  const { rows } = sheetRows(data, /.*/);
  const asOf = extractAsOf(rows);

  const headerIdx = rows.findIndex(
    (r) =>
      r.some((c) => /^Case Owner/i.test(String(c ?? '').trim())) &&
      r.some((c) => config.valueHeaderRe.test(String(c ?? '').trim())),
  );
  if (headerIdx === -1) throw new Error(`Response-time header not found in ${fileName}`);
  const header = rows[headerIdx];
  const ownerCol = header.findIndex((c) => /^Case Owner/i.test(String(c ?? '').trim()));
  const valueCol = header.findIndex((c) => config.valueHeaderRe.test(String(c ?? '').trim()));
  const countCol = config.countHeaderRe
    ? header.findIndex((c) => config.countHeaderRe.test(String(c ?? '').trim()))
    : -1;

  const agents: ResponseTimeAgent[] = [];
  let teamAvg = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const owner = String(row[ownerCol] ?? '').trim();
    if (!owner) continue;
    const value = toNumber(row[valueCol]);
    if (/^total$/i.test(owner)) {
      teamAvg = value;
    } else {
      agents.push({
        owner,
        value,
        count: countCol !== -1 ? toNumber(row[countCol]) : 0,
      });
    }
  }
  if (agents.length === 0) throw new Error(`No agent rows found in ${fileName}`);

  // Fallback: count-weighted team average if the export lacks a Total row.
  if (!teamAvg) {
    const weighted = agents.filter((a) => a.count > 0);
    if (weighted.length) {
      const v = weighted.reduce((s, a) => s + a.value * a.count, 0);
      const c = weighted.reduce((s, a) => s + a.count, 0);
      teamAvg = c > 0 ? v / c : 0;
    } else {
      teamAvg = agents.reduce((s, a) => s + a.value, 0) / agents.length;
    }
  }

  const agentAvg = agents.reduce((s, a) => s + a.value, 0) / agents.length;
  return {
    fileName,
    asOf,
    metric: config.metric,
    unit: config.unit,
    threshold: config.threshold,
    agents,
    teamAvg,
    agentAvg,
  };
}

/** Chat average response time (seconds). */
export function parseChatResponseTimeWorkbook(data: ArrayBuffer, fileName: string): ResponseTimeReport {
  return parseResponseTimeWorkbook(data, fileName, {
    metric: 'chat',
    unit: 'seconds',
    threshold: THRESHOLDS.chatResponse.value,
    valueHeaderRe: /Average Response Total Avg Time/i,
    countHeaderRe: /Avg Chat Total Count/i,
  });
}

/** Email first response time (hours). */
export function parseEmailFirstResponseWorkbook(data: ArrayBuffer, fileName: string): ResponseTimeReport {
  return parseResponseTimeWorkbook(data, fileName, {
    metric: 'emailFirst',
    unit: 'hours',
    threshold: THRESHOLDS.emailFirstResponse.value,
    valueHeaderRe: /Average First Response Time/i,
  });
}

/** Email average (overall) response time (hours). */
export function parseEmailAvgResponseWorkbook(data: ArrayBuffer, fileName: string): ResponseTimeReport {
  return parseResponseTimeWorkbook(data, fileName, {
    metric: 'emailAvg',
    unit: 'hours',
    threshold: THRESHOLDS.emailAvgResponse.value,
    valueHeaderRe: /Average Average Response Time/i,
    countHeaderRe: /Record Count/i,
  });
}
