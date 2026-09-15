/**
 * P0 spike — whisper.cpp WASM vs transformers.js performance benchmark.
 *
 * DEV-ONLY page (never routed in production builds): transcribes the same
 * 16 kHz PCM through both local engines and reports wall-clock medians so
 * the engine decision is data, not vibes:
 *
 *   tjs-base.en-q8          transformers.js pipeline (the production
 *                            baseline — Xenova/whisper-base.en, ORT wasm,
 *                            dtype q8, exactly like transcribe.worker.ts)
 *   tjs-base.fr-q8          ?lang=fr — the P3 French path: multilingual
 *                            Xenova/whisper-base with language='french',
 *                            exactly like the app's base.fr model
 *   cpp-<model>-q5_1-svc    whisper.cpp via the package's public
 *                            service.transcribe() (the exact call we'd
 *                            ship: full_default() runs the inference
 *                            synchronously; the promise resolves on the
 *                            engine's final stderr line)
 *
 * Test audio is the classic jfk.wav sample sliced to the production
 * segment length (8 s) — both engines see byte-identical PCM.
 *
 * P0 VERDICT (2026-09-11, 3-core Xeon sandbox, 8 s segment, medians):
 *   tjs  base.en q8  1 thread   3,996 ms  ← winner by ~8x
 *   tjs  base.fr q8  1 thread   4,415 ms  (French path costs ~10%)
 *   cpp  tiny.en q5_1 1 thread 14,589 ms
 *   cpp  tiny.en q5_1 3 threads  7,523 ms (1.94x scaling on 3 cores)
 *   cpp  base.en q5_1 1 thread 33,719 ms  (encode-bound)
 * GATE (≥1.5x speedup vs tjs): FAIL — 0.12x–0.53x. The
 * @timur00kh/whisper.wasm build carries SIMD and working pthreads but is
 * still 4–8x slower than ORT-wasm on identical input; whisper.cpp WASM is
 * REJECTED and transformers.js stays the ASR engine. Re-run anytime with
 * `npm run bench:whisper` (see scripts/bench-whisper.mjs for flags).
 *
 * Results land on window.__BENCH__ and render in-page; the Playwright
 * runner (scripts/bench-whisper.mjs) polls for window.__BENCH_DONE__ and
 * dumps the JSON.
 */

import { useEffect, useRef, useState } from 'react';
import { pipeline, env } from '@huggingface/transformers';
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { WhisperWasmService } from '@timur00kh/whisper.wasm';

// Model files come from the Hugging Face Hub — never probe the local origin.
env.allowLocalModels = false;

/** The production recorder segment length (use-call-capture SEGMENT_MS) */
const SEGMENT_SECONDS = 8;

const JFK_WAV_URL = 'https://huggingface.co/Xenova/transformers.js-docs/resolve/main/jfk.wav';
const CPP_MODEL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
const TJS_MODEL_EN = 'Xenova/whisper-base.en';
const TJS_MODEL_FR = 'Xenova/whisper-base';

interface EngineResult {
  label: string;
  runsMs: number[];
  medianMs: number | null;
  textSample: string;
  error: string | null;
}

interface BenchReport {
  audio: { source: string; sampleRate: number; seconds: number };
  runs: number;
  engines: EngineResult[];
  speedup: number | null;
  finishedAt: string;
}

/** Minimal WAV (PCM 16-bit) → Float32Array; resamples to 16 kHz if needed. */
async function loadWavAsFloat32(url: string, seconds: number): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audio fetch failed: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  // RIFF header walk: "fmt " (PCM) + "data" chunks.
  if (view.getUint32(0, false) !== 0x52494646) throw new Error('Not a RIFF/WAV file.');
  let offset = 12;
  let channels = 1;
  let sampleRate = 16000;
  let bits = 16;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (id === 0x666d7420) {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
    } else if (id === 0x64617461) {
      dataOffset = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0 || bits !== 16) throw new Error(`Unsupported WAV (bits=${bits}).`);
  const frameBytes = channels * (bits / 8);
  const frames = Math.floor(dataLength / frameBytes);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      sum += view.getInt16(dataOffset + i * frameBytes + ch * 2, true) / 32768;
    }
    mono[i] = sum / channels;
  }
  // Resample to 16 kHz when the source differs (linear is fine for a bench).
  if (sampleRate !== 16000) {
    const ratio = 16000 / sampleRate;
    const outLen = Math.floor(mono.length * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const src = i / ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, mono.length - 1);
      out[i] = mono[i0] + (mono[i1] - mono[i0]) * (src - i0);
    }
    mono.set(out.subarray(0, Math.min(out.length, mono.length)));
    mono.fill(0, Math.min(out.length, mono.length));
    sampleRate = 16000;
  }
  const slice = mono.subarray(0, Math.min(mono.length, 16000 * seconds));
  return { pcm: new Float32Array(slice), sampleRate };
}

/** Fetch model bytes with a simple progress logger (bench only, no UI). */
async function fetchModelBytes(url: string, onLog: (s: string) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model fetch failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total) onLog(`model download ${Math.round((received / total) * 100)}%`);
  }
  const out = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Parse "[start --> end] text" cue lines out of the service callback raw. */
function textFromSegments(segs: Array<{ text: string }>): string {
  return segs.map((s) => s.text.trim()).join(' ').trim();
}

export default function WhisperBenchPage() {
  const [log, setLog] = useState<string[]>([]);
  const [report, setReport] = useState<BenchReport | null>(null);
  const startedRef = useRef(false);

  // One engine per document (?engine=tjs|cpp|all): the container's 4 GB
  // memcg cannot hold the transformers.js ORT heap AND the whisper.cpp
  // wasm heap in the same renderer — running them in separate pages keeps
  // each under the limit and measures cleaner.
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const engineParam = search?.get('engine') ?? 'all';
  // ?lang=fr swaps the tjs baseline to the multilingual Xenova/whisper-base
  // export with language='french' — the exact base.fr path the app ships
  // (P3). Validated on jfk.wav: whisper is audio-driven, so English speech
  // under the French token exercises the full option path of a French call.
  const langParam = search?.get('lang') ?? 'en';
  // ?repo=org/name overrides the tjs model repo — same drop-in path a
  // LoRA-merged French export takes in the app (runtime adapters don't
  // exist in this stack, merged ONNX is the only browser-compatible LoRA
  // artifact; see whisper-models.ts). Bench any candidate export here
  // before pointing the app's override at it.
  const repoParam = search?.get('repo');
  const tjsModel = repoParam ?? (langParam === 'fr' ? TJS_MODEL_FR : TJS_MODEL_EN);
  const tjsLabel = repoParam
    ? `tjs-${repoParam.replace('Xenova/whisper-', '').replace('onnx-community/', '')}-q8`
    : langParam === 'fr'
      ? 'tjs-base.fr-q8'
      : 'tjs-base.en-q8';
  // ORT's wasm arena grows with every asr() call and the sandbox memcg
  // kills the renderer after a couple of calls (production has no such
  // limit) — the runner drives tjs with runs=1 per fresh context instead.
  const runCount = Math.max(1, Number(search?.get('runs') ?? 3) || 3);
  // cpp probes: model size + thread count (wasm pthread diagnostics).
  const cppModelFile = `ggml-${search?.get('model') ?? 'base.en'}-q5_1.bin`;
  const cppThreads = Math.max(1, Number(search?.get('threads') ?? 1) || 1);

  const addLog = (line: string) => {
    console.log(`[bench] ${line}`);
    setLog((prev) => [...prev.slice(-200), `${new Date().toISOString().slice(11, 23)}  ${line}`]);
  };

  useEffect(() => {
    if (startedRef.current) return; // React strict-mode double-invoke guard
    startedRef.current = true;
    void (async () => {
      const engines: EngineResult[] = [];

      const run = async (label: string, fn: () => Promise<{ ms: number; text: string }>) => {
        const runsMs: number[] = [];
        let textSample = '';
        try {
          for (let i = 0; i <= runCount; i++) {
            // i === 0 is the warmup (cache-compiled wasm, JIT, paged-in weights)
            addLog(`${label} run ${i === 0 ? 'warmup' : i}/${runCount}…`);
            const { ms, text } = await fn();
            if (i === 0) {
              textSample = text;
              addLog(`${label} warmup ${Math.round(ms)} ms — "${text.slice(0, 60)}…"`);
            } else {
              runsMs.push(ms);
              addLog(`${label} run ${i}: ${Math.round(ms)} ms`);
            }
          }
          engines.push({ label, runsMs, medianMs: median(runsMs), textSample, error: null });
        } catch (err) {
          addLog(`${label} FAILED: ${(err as Error).message}`);
          engines.push({ label, runsMs, medianMs: median(runsMs), textSample, error: (err as Error).message });
        }
      };

      try {
        addLog('Loading jfk.wav…');
        const { pcm, sampleRate } = await loadWavAsFloat32(JFK_WAV_URL, SEGMENT_SECONDS);
        addLog(`Audio ready: ${pcm.length} samples @ ${sampleRate} Hz (${SEGMENT_SECONDS}s).`);

        if (engineParam === 'all' || engineParam === 'tjs') {
          // ---- Baseline: transformers.js, exactly like transcribe.worker.ts ----
          addLog(`Loading ${tjsModel} (q8, wasm)…`);
          // Production pages are not cross-origin-isolated, so ORT runs
          // single-threaded there — pin the same here even though this
          // COI'd bench page would auto-select N workers (which also
          // balloons past the container memcg).
          env.backends.onnx.wasm.numThreads = 1;
          const t0 = performance.now();
          // No contextual type on the assignment (TS2590 otherwise) — the
          // safe cast happens at the call site instead.
          const pipe = await pipeline('automatic-speech-recognition', tjsModel, {
            device: 'wasm',
            dtype: 'q8',
          });
          const asr = pipe as unknown as AutomaticSpeechRecognitionPipeline;
          addLog(`tjs model ready in ${Math.round(performance.now() - t0)} ms.`);

          // French mode mirrors transcribe.worker.ts: multilingual model +
          // { language: 'french', task: 'transcribe' } (English .en models
          // must NOT receive these options — they throw).
          const tjsOptions = langParam === 'fr' ? { language: 'french', task: 'transcribe' } : {};
          await run(tjsLabel, async () => {
            const started = performance.now();
            const out = (await asr(pcm, tjsOptions)) as { text?: string };
            return { ms: performance.now() - started, text: (out.text ?? '').trim() };
          });
        }

        if (engineParam === 'all' || engineParam === 'cpp') {
          // ---- Candidate: whisper.cpp (whisper.wasm package) ----
          const cppModelUrl = `${CPP_MODEL_BASE}${cppModelFile}`;
          const modelTag = cppModelFile.match(/^ggml-(.+)-q\w+\.bin$/)?.[1] ?? cppModelFile;
          addLog(`Fetching ${cppModelFile}…`);
          const modelBytes = await fetchModelBytes(cppModelUrl, (s) => addLog(s));
          addLog(`Model bytes ready: ${Math.round(modelBytes.byteLength / 1048576)} MB.`);

          const service = new WhisperWasmService({
            // LoggerLevelsType is a numeric union (DEBUG=0) and Logger isn't
            // exported from the package root — DEBUG verbosity surfaces
            // whisper.cpp internals in the runner's console capture.
            logLevel: 0,
          });
          await service.initModel(modelBytes);
          addLog('whisper.cpp model initialized.');

          // Service path — the package's public promise-based API. This IS
          // the direct engine call: full_default() runs the whole inference
          // synchronously on the main thread (returns void; transcript lines
          // stream through its print callback), and the promise just awaits
          // the final stderr line / timeout. There is no cheaper "raw" path.
          await run(`cpp-${modelTag}-q5_1-svc-t${cppThreads}`, async () => {
            const started = performance.now();
            const { segments } = await service.transcribe(pcm, undefined, { language: 'en', threads: cppThreads });
            return { ms: performance.now() - started, text: textFromSegments(segments) };
          });
        }
      } catch (err) {
        addLog(`BENCH SETUP FAILED: ${(err as Error).message}`);
      }

      const byLabel = (needle: string) => engines.find((e) => e.label.includes(needle))?.medianMs ?? null;
      const tjsMs = byLabel(tjsLabel);
      const cppMs = byLabel('cpp-');

      const finalReport: BenchReport = {
        audio: { source: 'jfk.wav (Xenova/transformers.js-docs)', sampleRate: 16000, seconds: SEGMENT_SECONDS },
        runs: runCount,
        engines,
        speedup: tjsMs && cppMs ? tjsMs / cppMs : null,
        finishedAt: new Date().toISOString(),
      };
      setReport(finalReport);
      (window as unknown as { __BENCH__: BenchReport }).__BENCH__ = finalReport;
      (window as unknown as { __BENCH_DONE__: boolean }).__BENCH_DONE__ = true;
      addLog('BENCH DONE.');
    })();
  }, [addLog]);

  return (
    <div className="p-6 font-mono text-sm">
      <h1 className="mb-4 text-lg font-semibold">P0 spike — whisper.cpp WASM vs transformers.js</h1>
      <pre className="max-w-3xl whitespace-pre-wrap rounded bg-muted/40 p-4 text-xs leading-5">{log.join('\n')}</pre>
      {report && (
        <div className="mt-4 max-w-3xl">
          <h2 className="mb-2 font-semibold">Results (median of {report.runs}, {report.audio.seconds}s segment)</h2>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {report.engines.map((e) => (
                <tr key={e.label} className="border-b">
                  <td className="py-1 pr-4">{e.label}</td>
                  <td className="py-1 pr-4">
                    {e.error ? <span className="text-red-500">ERROR: {e.error}</span> : `${Math.round(e.medianMs ?? 0)} ms`}
                  </td>
                  <td className="py-1 text-muted-foreground">{e.textSample.slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.speedup != null && (
            <p className="mt-2">
              speedup: <b>{report.speedup.toFixed(2)}x</b> — gate: ≥1.5x
            </p>
          )}
        </div>
      )}
    </div>
  );
}
