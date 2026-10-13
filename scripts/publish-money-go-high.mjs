import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bucket = process.env.R2_BUCKET;
const key = process.env.DASHBOARD_DATA_KEY || 'dashboard-data.json';
const snapshotUrl = process.env.DASHBOARD_DATA_SOURCE_URL
  || 'https://pub-4f2a0555b3314f2b83bb90e44ea586f3.r2.dev/dashboard-data.json';
const output = resolve(root, 'dashboard_publish/dashboard-data.json');

if (!bucket) {
  throw new Error('Missing required environment variable: R2_BUCKET');
}

const moneyGoHigh = JSON.parse(
  readFileSync(resolve(root, 'scripts/money-go-high.json'), 'utf-8'),
);
if (
  !Array.isArray(moneyGoHigh.kpis)
  || moneyGoHigh.kpis.length === 0
  || moneyGoHigh.kpis.some((row) => (
    typeof row.name !== 'string'
    || !['higher', 'lower'].includes(row.direction)
    || !['number', 'percent'].includes(row.format)
    || ['challenge', 'target', 'threshold', 'weight', 'achievement', 'score']
      .some((field) => !Number.isFinite(row[field]))
  ))
  || !Number.isFinite(moneyGoHigh.totalScore)
) {
  throw new Error('Invalid Money Go High data in scripts/money-go-high.json');
}

const scoreSum = moneyGoHigh.kpis.reduce((sum, row) => sum + row.score, 0);
if (Math.abs(scoreSum - moneyGoHigh.totalScore) > 0.01) {
  throw new Error(
    `Money Go High score mismatch: KPI rows sum to ${scoreSum.toFixed(2)}, supplied total is ${moneyGoHigh.totalScore}`,
  );
}

const response = await fetch(`${snapshotUrl}?scorecard-refresh=${Date.now()}`, {
  cache: 'no-store',
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) {
  throw new Error(`Could not read existing dashboard snapshot: HTTP ${response.status}`);
}

const existing = await response.json();
if (
  !existing
  || typeof existing !== 'object'
  || !existing.csat
  || !existing.oneTouch
  || !existing.historical
  || !existing.sources
) {
  throw new Error('Existing R2 object is not a complete dashboard snapshot; refusing to replace it.');
}

const merged = {
  ...existing,
  sources: {
    ...existing.sources,
    moneyGoHigh: `${moneyGoHigh.source.sheetName} (revision ${moneyGoHigh.source.revision})`,
  },
  moneyGoHigh,
};
const serialized = `${JSON.stringify(merged, null, 2)}\n`;
if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized)) {
  throw new Error('Email address found in merged public dashboard snapshot; refusing to publish.');
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, serialized, 'utf-8');
console.log(
  `Prepared scorecard update: ${moneyGoHigh.kpis.length} KPIs, `
  + `${moneyGoHigh.totalScore.toFixed(2)} pts; retained agent snapshot ${existing.generatedAt}.`,
);

execFileSync('wrangler', [
  'r2', 'object', 'put', `${bucket}/${key}`,
  '--file', output,
  '--remote',
  '--content-type', 'application/json',
  '--cache-control', 'public, max-age=300, s-maxage=300',
  '--force',
], { cwd: root, stdio: 'inherit' });

console.log(`Published Money Go High data to ${bucket}/${key}.`);
