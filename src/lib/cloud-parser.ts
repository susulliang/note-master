/**
 * Cloud ticket-field parser — selected remote model, on demand.
 *
 * The cloud parse is a single explicit action: the agent clicks "Parse",
 * and the prompt is sent to the authenticated Worker LLM serving endpoint.
 * The selected remote model is stored locally; provider credentials never
 * enter the browser.
 *
 * Prompt construction and reply validation are shared with the local
 * parser (src/lib/llm-parser.ts): same system contract, same loose
 * JSON/line salvage, same canonicalization — only the inference backend
 * differs.
 */

import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import {
  readRemoteLlmModel,
  requestRemoteChatCompletion,
} from '@/lib/llm-serving-client';
import {
  buildParsePrompt,
  extractJsonLoose,
  extractLineFields,
  extractTldr,
  validateLlmFields,
  type PriorLlmValues,
} from '@/lib/llm-parser';

/** Reply token budget — the eleven condensed fields fit comfortably.
 *  Used both for MAX_TOKENS in the request payload and as the denom
 *  for the streamed generation progress bar (0..max → 0..1). */
const MAX_TOKENS = 2048;

/** Progress stage for callers that want to drive a status label too. */
export type RemoteLlmProgressStage = 'connecting' | 'streaming' | 'finalizing';

/** One cloud round-trip: what went in, what came back, how long it took */
export interface CloudParseResult {
  /** Validated fields (possibly []) — validation is shared with the local parser */
  fields: ExtractedField[];
  /**
   * Bilingual whole-call TLDR the prompt also asks for ('' halves when the
   * model omitted them). The ZH half is appended to the ticket note's
   * Additional information section at note generation.
   */
  tldr: { en: string; zh: string };
  /** Raw model reply (debug display) */
  raw: string;
  /** prompt chars actually sent (window + system) */
  promptChars: number;
  /** round-trip wall time (ms) */
  ms: number;
}

/**
 * Decode an SSE (text/event-stream) response body from the OpenAI-style
 * chat-completions endpoint and feed each delta payload to a callback.
 * Resolves with the fully-concatenated assistant content. The stream
 * format is a sequence of "data: {…}\n\n" frames, terminated by the
 * literal "data: [DONE]\n\n".
 */
async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  onDelta: (deltaText: string) => void
): Promise<string> {
  let buffer = '';
  let acc = '';
  let done = false;
  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: true });
    // Split frames at \n\n
    let sepIdx: number;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const rawFrame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      // A frame may contain multiple "data: …" lines; we pick the LAST
      // non-empty line (standard SSE).
      let payload = '';
      for (const line of rawFrame.split('\n')) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('data:')) {
          payload = trimmed.slice(5).trimStart();
        }
      }
      if (!payload) continue;
      if (payload === '[DONE]') {
        done = true;
        break;
      }
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
            finish_reason?: string | null;
          }>;
        };
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        // V4 Flash can emit `reasoning_content` during think-time — we
        // ignore it (not user-visible) and only advance on output tokens.
        const content = delta.content ?? '';
        if (content.length > 0) {
          acc += content;
          onDelta(content);
        }
        if (json.choices?.[0]?.finish_reason) done = true;
      } catch {
        /* malformed SSE frame — skip it */
      }
    }
  }
  // Flush any tail bytes left in the buffer
  buffer += decoder.decode();
  return acc;
}

/**
 * Generic chat completion through the shared remote LLM service — returns the
 * full assistant reply text (not field-structured) along with wall-time
 * and a soft timedOut flag that mirrors the local LLM generate signature.
 * Used by SOP reranking, QA scoring, live TLDR, and other small tasks.
 */
export async function generateWithRemoteLlm(
  system: string,
  user: string,
  maxTokens = 512,
  onProgress?: (pct: number, stage: RemoteLlmProgressStage) => void
): Promise<{ text: string; ms: number; timedOut: boolean }> {
  const started = performance.now();
  onProgress?.(0, 'connecting');
  if (!system && !user) return { text: '', ms: 0, timedOut: false };

  let response: Response;
  try {
    response = await requestRemoteChatCompletion({
      model: readRemoteLlmModel(),
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: Math.max(1, Math.min(8192, maxTokens | 0)),
      stream: Boolean(onProgress),
    });
  } catch (err) {
    return {
      text: (err as Error).message || 'Remote AI request failed.',
      ms: Math.round(performance.now() - started),
      timedOut: true,
    };
  }

  let raw = '';
  if (onProgress && response.body) {
    onProgress(0.05, 'streaming');
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let outChars = 0;
      raw = await readSseStream(reader, decoder, (delta) => {
        outChars += delta.length;
        const estTokens = Math.ceil(outChars / 4);
        const denom = Math.max(1, maxTokens | 0 || 512);
        const pct = Math.max(0.1, Math.min(0.95, estTokens / denom));
        onProgress(pct, 'streaming');
      });
    } catch {
      return { text: 'Stream disconnected mid-reply.', ms: Math.round(performance.now() - started), timedOut: true };
    }
    onProgress(0.97, 'finalizing');
  } else {
    try {
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      raw = body.choices?.[0]?.message?.content ?? '';
    } catch {
      return { text: 'Malformed response body.', ms: Math.round(performance.now() - started), timedOut: true };
    }
  }
  onProgress?.(1, 'finalizing');
  return { text: raw, ms: Math.round(performance.now() - started), timedOut: !raw };
}

/**
 * Run one remote-model extraction over the transcript. NEVER rejects — network
 * and API errors come back as an `error` string so callers can surface
 * them without try/catch gymnastics. A result with fields=[] and an error
 * means the call failed; fields=[] without error means the model found
 * nothing fillable.
 *
 * When `onProgress` is supplied the call uses SSE streaming and pushes
 * a 0..1 completion ratio + stage label. The first two discrete jumps
 * (connecting → 5% then first streamed token → 10%) are intentional
 * anchors so a spinning caller isn't stuck at 0 until mid-response.
 */
export async function parseWithRemoteLlm(
  _apiKey: string,
  entries: TranscriptEntry[],
  prior?: PriorLlmValues,
  onProgress?: (pct: number, stage: RemoteLlmProgressStage) => void,
  /** 'full' = every clause (default); 'concise' = drop tangents, keep 2–4
   *  primary issues + 2–4 primary resolutions while preserving accuracy. */
  mode: 'full' | 'concise' = 'full'
): Promise<{ result: CloudParseResult | null; error: string | null }> {
  if (entries.length === 0) return { result: null, error: 'Nothing to parse — the transcript is empty.' };

  // Same prompt contract as the local parser. Cloud models handle huge
  // windows cheaply (V4 flash has 1M ctx, 128k output) but keep a generous
  // 16k-char ceiling anyway — the agent never needs more than a couple
  // hours of call text, and shorter prompts == better structured replies.
  const CLOUD_MAX_CHARS = 16_000;
  const { system, user } = buildParsePrompt(
    entries,
    [],
    prior,
    /* strict= */ false,
    /* format= */ 'simple',
    /* maxChars= */ CLOUD_MAX_CHARS,
    mode,
    /* includeTldr= */ true
  );
  const started = performance.now();
  onProgress?.(0, 'connecting');

  let response: Response;
  try {
    response = await requestRemoteChatCompletion({
      model: readRemoteLlmModel(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      maxTokens: MAX_TOKENS,
      stream: Boolean(onProgress),
    });
  } catch (err) {
    return {
      result: null,
      error: (err as Error).message || 'Remote AI request failed.',
    };
  }

  let raw = '';
  if (onProgress && response.body) {
    // Streamed response — report per-delta progress against MAX_TOKENS.
    // We count output characters (~4 = 1 token) as a proxy for streamed
    // tokens (providers do not send usage mid-stream in SSE deltas).
    onProgress(0.05, 'streaming');
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let outChars = 0;
      raw = await readSseStream(reader, decoder, (delta) => {
        outChars += delta.length;
        // 4 chars ≈ 1 token; clamp progress so we never hit exactly 1.0
        // before we've finalized validation (finalizing stage bumps to 1).
        const estTokens = Math.ceil(outChars / 4);
        const pct = Math.max(0.1, Math.min(0.95, estTokens / Math.max(1, MAX_TOKENS)));
        onProgress(pct, 'streaming');
      });
    } catch {
      return { result: null, error: 'Remote AI stream disconnected mid-reply.' };
    }
    onProgress(0.97, 'finalizing');
  } else {
    try {
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      raw = body.choices?.[0]?.message?.content ?? '';
    } catch {
      return { result: null, error: 'Remote AI returned a malformed response body.' };
    }
  }

  if (!raw) return { result: null, error: 'Remote AI returned an empty reply.' };

  // Shared validation: loose JSON first, then field:value lines (V4 Flash
  // reliably emits JSON, but the line fallback costs nothing)
  const parsed = extractJsonLoose(raw) ?? extractLineFields(raw);
  const fields = parsed ? validateLlmFields(parsed) : [];
  onProgress?.(1, 'finalizing');

  return {
    result: {
      fields,
      tldr: extractTldr(raw),
      raw: raw.slice(0, 4000),
      promptChars: system.length + user.length,
      ms: Math.round(performance.now() - started),
    },
    error: null,
  };
}
