/**
 * Cloud ticket-field parser — DeepSeek v4 Flash, on demand.
 *
 * Unlike the local LLM (which re-reads the conversation automatically as
 * it grows), the cloud parse is a SINGLE explicit action: the agent clicks
 * "Parse", the current transcript window + extraction prompt go to the
 * DeepSeek API (via an env-var API key when set, otherwise the agent's
 * locally-stored key), and the reply's fields overwrite every regex
 * provisionally filled. DeepSeek-V4-Flash has a 1M-token context, reads a
 * garbled ASR transcript far better than any 0.5B local model, and
 * round-trips in a few seconds.
 *
 * When the host sets VITE_DEEPSEEK_API_KEY (Vercel / Cloudflare secrets →
 * build-time exposed env var) the parser is the DEFAULT backend: no API
 * key entry is shown to the agent and the UI drops the DeepSeek brand
 * labels (generic "AI Parse" copy only). The agent can still switch to a
 * local on-device model in settings — that is the opt-out path.
 *
 * Prompt construction and reply validation are shared with the local
 * parser (src/lib/llm-parser.ts): same system contract, same loose
 * JSON/line salvage, same canonicalization — only the inference backend
 * differs.
 */

import type { ExtractedField, TranscriptEntry } from '@/lib/field-extraction';
import {
  buildParsePrompt,
  extractJsonLoose,
  extractLineFields,
  validateLlmFields,
  type PriorLlmValues,
} from '@/lib/llm-parser';

/** DeepSeek API — OpenAI-compatible chat completions endpoint */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';

/** localStorage key for the agent's DeepSeek API key (used when no env var) */
const DEEPSEEK_API_KEY_STORAGE = 'nm-deepseek-api-key';

/**
 * API key resolution chain:
 *   1. VITE_DEEPSEEK_API_KEY set via Vercel / Cloudflare secrets at build time
 *      (true "default" DeepSeek mode — no UI key management)
 *   2. localStorage value (agent entered a key manually in Engine settings)
 */
export function getEffectiveApiKey(): string {
  try {
    const fromEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })
      .env?.VITE_DEEPSEEK_API_KEY;
    if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  } catch {
    /* import.meta unavailable in non-module contexts (harmless) */
  }
  return readDeepseekApiKey();
}

/**
 * True when the runtime has a VITE_DEEPSEEK_API_KEY env secret loaded.
 * In this mode DeepSeek is the DEFAULT inference backend for AI parse,
 * and the UI drops the DeepSeek selection row + brand tags.
 */
export function isDeepSeekDefault(): boolean {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_DEEPSEEK_API_KEY;
    return typeof v === 'string' && v.trim().length > 0;
  } catch {
    return false;
  }
}

export function readDeepseekApiKey(): string {
  try {
    return localStorage.getItem(DEEPSEEK_API_KEY_STORAGE) ?? '';
  } catch {
    /* private mode / unavailable */
  }
  return '';
}

export function writeDeepseekApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(DEEPSEEK_API_KEY_STORAGE, key);
    else localStorage.removeItem(DEEPSEEK_API_KEY_STORAGE);
  } catch {
    /* private mode / unavailable */
  }
}

/** Reply token budget — the eleven condensed fields fit comfortably.
 *  Used both for MAX_TOKENS in the request payload and as the denom
 *  for the streamed generation progress bar (0..max → 0..1). */
const MAX_TOKENS = 2048;

/** Progress stage for callers that want to drive a status label too. */
export type DeepseekProgressStage = 'connecting' | 'streaming' | 'finalizing';

/** One cloud round-trip: what went in, what came back, how long it took */
export interface CloudParseResult {
  /** Validated fields (possibly []) — validation is shared with the local parser */
  fields: ExtractedField[];
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
 * Run one DeepSeek extraction over the transcript. NEVER rejects — network
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
export async function parseWithDeepseek(
  apiKey: string,
  entries: TranscriptEntry[],
  prior?: PriorLlmValues,
  onProgress?: (pct: number, stage: DeepseekProgressStage) => void
): Promise<{ result: CloudParseResult | null; error: string | null }> {
  const key = apiKey || getEffectiveApiKey();
  if (!key) return { result: null, error: 'No DeepSeek API key stored.' };
  if (entries.length === 0) return { result: null, error: 'Nothing to parse — the transcript is empty.' };

  // Same prompt contract as the local parser. The window cap keeps parity
  // with what the agent sees highlighted as "will be sent".
  const { system, user } = buildParsePrompt(entries, [], prior);
  const started = performance.now();
  onProgress?.(0, 'connecting');

  let response: Response;
  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        Accept: onProgress ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        // Deterministic extraction, not creative writing; V4 thinking is
        // pointless overhead for a field-filling task
        temperature: 0,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'disabled' },
        stream: Boolean(onProgress),
      }),
    });
  } catch (err) {
    return {
      result: null,
      error: `Network error reaching DeepSeek: ${(err as Error).message}. Check your connection.`,
    };
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = `${response.status}: ${body.error.message}`;
    } catch {
      /* non-JSON error body — keep the status line */
    }
    if (response.status === 401) {
      return { result: null, error: `DeepSeek rejected the API key (${detail}). Re-enter it below.` };
    }
    return { result: null, error: `DeepSeek API error — ${detail}` };
  }

  let raw = '';
  if (onProgress && response.body) {
    // Streamed response — report per-delta progress against MAX_TOKENS.
    // We count output characters (~4 = 1 token) as a proxy for streamed
    // tokens (DeepSeek does not send usage mid-stream in SSE deltas).
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
      return { result: null, error: 'DeepSeek stream disconnected mid-reply.' };
    }
    onProgress(0.97, 'finalizing');
  } else {
    try {
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      raw = body.choices?.[0]?.message?.content ?? '';
    } catch {
      return { result: null, error: 'DeepSeek returned a malformed response body.' };
    }
  }

  if (!raw) return { result: null, error: 'DeepSeek returned an empty reply.' };

  // Shared validation: loose JSON first, then field:value lines (V4 Flash
  // reliably emits JSON, but the line fallback costs nothing)
  const parsed = extractJsonLoose(raw) ?? extractLineFields(raw);
  const fields = parsed ? validateLlmFields(parsed) : [];
  onProgress?.(1, 'finalizing');

  return {
    result: {
      fields,
      raw: raw.slice(0, 4000),
      promptChars: system.length + user.length,
      ms: Math.round(performance.now() - started),
    },
    error: null,
  };
}
