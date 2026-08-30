/**
 * Cloud ticket-field parser — DeepSeek v4 Flash, on demand.
 *
 * Unlike the local LLM (which re-reads the conversation automatically as
 * it grows), the cloud parse is a SINGLE explicit action: the agent clicks
 * "Cloud parse", the current transcript window + extraction prompt go to
 * the DeepSeek API, and the reply's fields overwrite everything regex
 * provisionally filled. DeepSeek-V4-Flash has a 1M-token context, reads a
 * garbled ASR transcript far better than any 0.5B local model, and
 * round-trips in a few seconds — at the cost of sending call audio text
 * to a third party, which is why it is opt-in per click and needs an
 * explicit API key.
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

/** localStorage key for the agent's DeepSeek API key */
const DEEPSEEK_API_KEY_STORAGE = 'nm-deepseek-api-key';

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

/** Reply token budget — the eleven condensed fields fit comfortably */
const MAX_TOKENS = 2048;

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
 * Run one DeepSeek extraction over the transcript. NEVER rejects — network
 * and API errors come back as an `error` string so callers can surface
 * them without try/catch gymnastics. A result with fields=[] and an error
 * means the call failed; fields=[] without error means the model found
 * nothing fillable.
 */
export async function parseWithDeepseek(
  apiKey: string,
  entries: TranscriptEntry[],
  prior?: PriorLlmValues
): Promise<{ result: CloudParseResult | null; error: string | null }> {
  if (!apiKey) return { result: null, error: 'No DeepSeek API key stored.' };
  if (entries.length === 0) return { result: null, error: 'Nothing to parse — the transcript is empty.' };

  // Same prompt contract as the local parser. The window cap keeps parity
  // with what the agent sees highlighted as "will be sent".
  const { system, user } = buildParsePrompt(entries, [], prior);
  const started = performance.now();

  let response: Response;
  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
        stream: false,
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
  try {
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    raw = body.choices?.[0]?.message?.content ?? '';
  } catch {
    return { result: null, error: 'DeepSeek returned a malformed response body.' };
  }
  if (!raw) return { result: null, error: 'DeepSeek returned an empty reply.' };

  // Shared validation: loose JSON first, then field:value lines (V4 Flash
  // reliably emits JSON, but the line fallback costs nothing)
  const parsed = extractJsonLoose(raw) ?? extractLineFields(raw);
  const fields = parsed ? validateLlmFields(parsed) : [];

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
