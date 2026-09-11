#!/usr/bin/env node
/**
 * P0 spike runner — drives the dev-only /whisper-bench page in headless
 * Chromium and prints the benchmark JSON. Requires the dev server to be
 * running (npm run dev → http://localhost:8001).
 *
 * Sandbox egress only reliably accepts proxied curl traffic (Chromium's
 * TLS through the HTTP proxy gets reset with ERR_CONNECTION_CLOSED), so
 * every huggingface.co request is intercepted: downloaded once via curl
 * into .bench-cache/ and served back to the page from a loopback mirror
 * with CORS. The page code stays untouched — it still "sees" the real
 * https://huggingface.co URLs and follows the 302 to the mirror.
 *
 * Usage: node scripts/bench-whisper.mjs [--port 8001] [--timeout 900000]
 *   [--engine tjs|cpp|all] [--model tiny.en|base.en|small.en] [--threads N]
 *   [--lang en|fr] [--contexts N]
 */

import { chromium } from 'playwright';
import http from 'node:http';
import { execFile } from 'node:child_process';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const port = Number(arg('port', '8001'));
const timeout = Number(arg('timeout', String(15 * 60 * 1000)));
const engineFilter = arg('engine', 'all');
const cppModel = arg('model', 'base.en');
const cppThreads = Number(arg('threads', '1'));
const lang = arg('lang', 'en');
const contextsArg = arg('contexts', '');

const BENCH_URL = `http://localhost:${port}/whisper-bench`;
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const CACHE_ROOT = path.join(process.cwd(), '.bench-cache');
mkdirSync(CACHE_ROOT, { recursive: true });

const MIME = {
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.md': 'text/markdown',
};
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
};

/** Normalize a HF URL to its cache identity (query strings are dropped). */
function cacheKeyFor(url) {
  const u = new URL(url);
  return `${u.hostname}${decodeURIComponent(u.pathname)}`;
}

function cachePathFor(key) {
  if (key.includes('..')) throw new Error(`Refusing suspicious path: ${key}`);
  return path.join(CACHE_ROOT, key);
}

// Sandbox egress blocks huggingface.co TLS entirely, but hf-mirror.com (a
// public HF mirror) is reachable through the proxy — rewrite downloads.
const DOWNLOAD_REWRITE = { from: 'https://huggingface.co/', to: 'https://hf-mirror.com/' };

// Assets unavailable on the mirror are prepared locally (see
// .bench-cache/local/): jfk.flac comes from openai/whisper on GitHub raw and
// is converted to 16 kHz mono WAV by ffmpeg.
const LOCAL_OVERRIDES = new Map([
  [
    'https://huggingface.co/Xenova/transformers.js-docs/resolve/main/jfk.wav',
    path.join(CACHE_ROOT, 'local', 'jfk-16k.wav'),
  ],
]);

const inFlight = new Map();

/** Download `url` via curl (proxy-aware) into the cache; returns final status. */
async function ensureCached(url) {
  const key = cacheKeyFor(url);
  if (inFlight.has(key)) return inFlight.get(key);
  const job = (async () => {
    const target = cachePathFor(key);
    if (existsSync(target)) return { status: 200, file: target, key };

    const override = LOCAL_OVERRIDES.get(url);
    if (override && existsSync(override)) {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(override, target);
      console.log(`[mirror] served ${url} from local override ${override}`);
      return { status: 200, file: target, key };
    }

    const downloadUrl = url.startsWith(DOWNLOAD_REWRITE.from)
      ? DOWNLOAD_REWRITE.to + url.slice(DOWNLOAD_REWRITE.from.length)
      : url;
    mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.part`;
    console.log(`[mirror] downloading ${downloadUrl}`);
    const { stdout } = await execFileP('curl', [
      '-sSL',
      ...(PROXY ? ['-x', PROXY] : []),
      '--connect-timeout', '20',
      '--retry', '2',
      '--max-time', '600',
      '-o', tmp,
      '-w', '%{http_code}',
      downloadUrl,
    ]);
    const status = Number(stdout.trim().slice(-3));
    if (status >= 200 && status < 300) {
      renameSync(tmp, target);
      const mb = (statSync(target).size / 1048576).toFixed(1);
      console.log(`[mirror] ${status} ${url} → ${mb} MB (cached)`);
      return { status: 200, file: target, key };
    }
    rmSync(tmp, { force: true });
    console.error(`[mirror] HTTP ${status} for ${url}`);
    return { status: status || 502, file: null, key };
  })();
  inFlight.set(key, job);
  try {
    return await job;
  } catch (err) {
    console.error(`[mirror] download failed: ${url} — ${err.message}`);
    return { status: 502, file: null, key: null };
  } finally {
    inFlight.delete(key);
  }
}

// Loopback mirror serving cached files (streamed — no CDP body transfer for
// the 100+ MB model files; the browser connects directly, proxy bypassed).
const mirror = http.createServer((req, res) => {
  const prefix = '/mirror/';
  if (!req.url || !req.url.startsWith(prefix)) {
    res.writeHead(404, CORS).end();
    return;
  }
  const key = decodeURIComponent(req.url.slice(prefix.length));
  const file = cachePathFor(key);
  if (!file.startsWith(CACHE_ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, CORS).end();
    return;
  }
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    ...CORS,
    'content-type': type,
    'content-length': statSync(file).size,
  });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => mirror.listen(0, '127.0.0.1', resolve));
const mirrorPort = mirror.address().port;

const browser = await chromium.launch({
  headless: true,
  ...(PROXY ? { proxy: { server: PROXY, bypass: 'localhost,127.0.0.1' } } : {}),
});
try {
  console.log(`Opening ${BENCH_URL} (mirror on 127.0.0.1:${mirrorPort}) …`);

  // The container's 4 GB memcg can't hold both engines' wasm heaps in one
  // renderer, so each engine runs in its own (sequential) browser context.
  const attach = (page) => {
    page.on('console', (msg) => {
      const text = msg.text();
      const type = msg.type();
      // Logger (and emscripten printErr) write through console.warn — capture
      // warnings too, or abort reasons get swallowed.
      if (type === 'error' || type === 'warning') console.error(`[console.${type}]`, text);
      else if (text.startsWith('[bench]')) console.log(text);
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    page.on('requestfailed', (req) => {
      const failure = req.failure()?.errorText ?? '';
      if (!failure.includes('ERR_ABORTED')) console.error('[requestfailed]', req.url(), failure);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) console.error('[http]', res.status(), res.url());
    });
    return page.route(/huggingface\.co\//, async (route) => {
      const url = route.request().url();
      try {
        const { status, key } = await ensureCached(url);
        if (status !== 200 || !key) {
          return route.fulfill({ status, headers: CORS, body: '' });
        }
        const location = `http://127.0.0.1:${mirrorPort}/mirror/${encodeURIComponent(key)}`;
        return route.fulfill({ status: 302, headers: { ...CORS, location } });
      } catch (err) {
        console.error('[mirror] route failed:', url, err.message);
        return route.abort('failed');
      }
    });
  };

  const runPhase = async (phase) => {
    console.log(`\n===== phase: ${phase.engine} (contexts: ${phase.contexts}) =====`);
    const engines = [];
    for (let c = 0; c < phase.contexts; c++) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await attach(page);
        const url = `${BENCH_URL}?engine=${phase.engine}&runs=${phase.runs}&lang=${lang}`
          + (phase.engine === 'cpp' ? `&model=${cppModel}&threads=${cppThreads}` : '');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        if (c === 0) console.log('Waiting for __BENCH_DONE__ (model downloads ~130 MB) …');
        await page.waitForFunction(() => window.__BENCH_DONE__ === true, null, { timeout });
        const report = await page.evaluate(() => window.__BENCH__);
        engines.push(...(report?.engines ?? []));
      } finally {
        await context.close();
      }
    }
    return engines;
  };

  // tjs: ORT arena growth OOMs the 4 GB memcg after ~2 calls per renderer,
  // so each context does warmup + 1 measured call. cpp: steady heap, one
  // context with 3 measured runs.
  const phases = [];
  const tjsContexts = Number(contextsArg) || 3;
  if (engineFilter === 'all' || engineFilter === 'tjs') phases.push({ engine: 'tjs', contexts: tjsContexts, runs: 1 });
  if (engineFilter === 'all' || engineFilter === 'cpp') phases.push({ engine: 'cpp', contexts: 1, runs: 3 });
  const engines = [];
  for (const phase of phases) engines.push(...(await runPhase(phase)));

  // Merge same-label engine results across contexts.
  const merged = new Map();
  for (const e of engines) {
    const cur = merged.get(e.label) ?? { label: e.label, runsMs: [], textSample: '', error: null };
    cur.runsMs.push(...(e.runsMs ?? []));
    if (e.textSample) cur.textSample = e.textSample;
    if (e.error) cur.error = e.error;
    merged.set(e.label, cur);
  }
  const enginesMerged = [...merged.values()].map((e) => {
    const sorted = [...e.runsMs].sort((a, b) => a - b);
    return { ...e, medianMs: sorted.length ? (sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length - 1 >> 1] + sorted[sorted.length >> 1]) / 2) : null };
  });

  const report = {
    audio: { source: 'jfk.wav (Xenova/transformers.js-docs)', sampleRate: 16000, seconds: 8 },
    runs: 3,
    lang,
    cppModel,
    cppThreads,
    engines: enginesMerged,
    finishedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));

  const byLabel = (needle) => enginesMerged.find((e) => e.label.includes(needle))?.medianMs ?? null;
  const tjsMs = byLabel('tjs-');
  const cppMs = byLabel('cpp-');
  const speedup = tjsMs && cppMs ? tjsMs / cppMs : null;
  report.speedup = speedup;

  const gate = 1.5;
  console.log('\n──────── P0 GATE ────────');
  if (typeof speedup === 'number') {
    console.log(`cpp speedup: ${speedup.toFixed(2)}x`);
    console.log(speedup >= gate ? 'PASS (≥1.5x)' : `FAIL (<${gate}x)`);
  } else {
    console.log('FAIL (no comparison available)');
  }
} finally {
  await browser.close();
  mirror.close();
}
