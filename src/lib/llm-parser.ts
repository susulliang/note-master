/**
 * Ultra-small local LLM — the PRIMARY ticket-field parser.
 *
 * An on-device instruction-following LLM (transformers.js v3, WASM) reads
 * the speaker-tagged conversation — agent and customer speech together,
 * through a SLIDING tail window that keeps the newest ~10 minutes of
 * speech (older turns slide out; their extracted values are carried
 * forward in the prompt, so nothing already noted is lost) — and maps it
 * onto the ticket form. The system prompt is deliberately minimal: format
 * hints instead of catalog dumps (no 247-model list, no issue-type
 * catalog), so the conversation owns the token budget. Pattern matching
 * (the regex engine in src/lib/field-extraction.ts) is relegated to a
 * provisional stopgap: it may pre-fill format-verifiable identifiers while
 * the model is unavailable, and everything it fills is provisional until
 * the LLM's full-context reading of the situation replaces it. Audio and
 * transcript never leave the machine: there is no API key and no
 * per-request cost, just a one-time model download cached by the browser.
 *
 * Model choices are deliberately tiny so CPU/WASM inference stays tolerable:
 *
 *   smollm2-360m — HuggingFaceTB/SmolLM2-360M-Instruct (default; ~360M
 *                  params, fastest sensible extraction quality)
 *   qwen2.5-0.5b — onnx-community/Qwen2.5-0.5B-Instruct (smarter, heavier)
 *
 * Validation is the critical piece: the LLM may hallucinate. Values are
 * clamped against the canonical option lists where one exists (robot
 * models, issue types); a model name the fleet list cannot canonicalize
 * is kept as the LLM wrote it — the yellow glow marks it for the agent
 * to verify — and any field the reply cannot justify is dropped.
 */

import type { TranscriptEntry, ExtractedField } from '@/lib/field-extraction';
import { matchCanonicalModel, canonicalIssueType, classifyIssueType, stripAsrArtifacts } from '@/lib/field-extraction';

// ---------------------------------------------------------------------------
//  Model registry
// ---------------------------------------------------------------------------

/** Hugging Face repo per selectable model */
export const LOCAL_LLM_MODELS = {
  'smollm2-360m': 'HuggingFaceTB/SmolLM2-360M-Instruct',
  'qwen2.5-0.5b': 'onnx-community/Qwen2.5-0.5B-Instruct',
  'qwen2.5-1.5b': 'onnx-community/Qwen2.5-1.5B-Instruct',
} as const;

export type LlmModelName = keyof typeof LOCAL_LLM_MODELS;

/**
 * Default: Qwen2.5-0.5B. Two consecutive field-test calls produced broken
 * replies from the 360M model — at that size instruction-following over a
 * 10-field JSON contract is marginal, while 0.5B handles it far more
 * reliably. The 1.5B option is there when even sharper reading is wanted.
 */
export const DEFAULT_LLM_MODEL: LlmModelName = 'qwen2.5-0.5b';

export const LLM_MODEL_META: Record<LlmModelName, { label: string; note: string }> = {
  'smollm2-360m': {
    label: 'SmolLM2 360M',
    note: 'Fastest · ~200 MB one-time download · weakest reading',
  },
  'qwen2.5-0.5b': {
    label: 'Qwen2.5 0.5B',
    note: 'Default AI parser · ~350 MB one-time download · reliable JSON extraction',
  },
  'qwen2.5-1.5b': {
    label: 'Qwen2.5 1.5B',
    note: 'Sharpest AI parser · ~1.1 GB one-time download · best understanding, slower parses',
  },
};

export const LLM_MODELS = Object.keys(LOCAL_LLM_MODELS) as LlmModelName[];

/**
 * Precision fallback chain, mirroring the Whisper setup: `q8` first (small
 * download, well-supported by the WASM execution provider), `fp32` as the
 * larger escape hatch for exports the runtime cannot instantiate.
 */
export const LLM_DTYPE_CHAIN = ['q8', 'fp32'] as const;

export type LlmDtype = (typeof LLM_DTYPE_CHAIN)[number];

// ---------------------------------------------------------------------------
//  Worker protocol (main thread ⇆ src/workers/llm-parser.worker.ts)
// ---------------------------------------------------------------------------

export interface LlmLoadMessage {
  type: 'load';
  model: LlmModelName;
  dtype?: LlmDtype;
}

export interface LlmParseMessage {
  type: 'parse';
  id: number;
  /** System + user prompt, already rendered chat-template-free */
  system: string;
  user: string;
  /** Cap on generated tokens (keeps WASM inference bounded) */
  maxNewTokens: number;
}

export type LlmWorkerRequest = LlmLoadMessage | LlmParseMessage;

export type LlmWorkerEvent =
  | { type: 'load-start'; model: LlmModelName }
  | { type: 'progress'; model: LlmModelName; progress: number }
  | { type: 'ready'; model: LlmModelName; dtype: LlmDtype }
  | { type: 'load-error'; model: LlmModelName; message: string }
  | { type: 'result'; id: number; text: string; ms: number }
  | { type: 'parse-error'; id: number; message: string };

/** localStorage keys for user preferences */
const LLM_MODEL_PREF_KEY = 'nm-llm-model';
const LLM_ENABLED_PREF_KEY = 'nm-llm-enabled';

export function readLlmModelPref(): LlmModelName {
  try {
    const value = localStorage.getItem(LLM_MODEL_PREF_KEY);
    if (value && value in LOCAL_LLM_MODELS) return value as LlmModelName;
  } catch {
    /* private mode / unavailable */
  }
  return DEFAULT_LLM_MODEL;
}

export function writeLlmModelPref(model: LlmModelName): void {
  try {
    localStorage.setItem(LLM_MODEL_PREF_KEY, model);
  } catch {
    /* private mode / unavailable */
  }
}

export function readLlmEnabledPref(): boolean {
  try {
    const value = localStorage.getItem(LLM_ENABLED_PREF_KEY);
    // Enabled by default; the pref only stores explicit opt-outs
    return value === null ? true : value === '1';
  } catch {
    /* private mode / unavailable */
  }
  return true;
}

export function writeLlmEnabledPref(enabled: boolean): void {
  try {
    localStorage.setItem(LLM_ENABLED_PREF_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode / unavailable */
  }
}

// ---------------------------------------------------------------------------
//  Prompt construction
// ---------------------------------------------------------------------------

/** Field ids the LLM may be asked for, with short prompt descriptions */
const LLM_FIELD_IDS = [
  'customerName',
  'contactNumber',
  'emailAddress',
  'deebotModel',
  'skuNumber',
  'serialNumber',
  'purchaseInfo',
  'issueDescription',
  'issueType',
  'resolutionSummary',
] as const;

export type LlmFieldId = (typeof LLM_FIELD_IDS)[number];

/**
 * Sliding-window size: how many transcript characters each parse feeds the
 * model — the TAIL (newest) of the conversation. On calls longer than the
 * window, older turns slide out of the prompt and their extracted values
 * are carried forward instead (see PriorLlmValues).
 *
 * ~10000 chars ≈ 10 minutes of speech. The system prompt is deliberately
 * minimal (~400 tokens: no model list, no issue-type catalog — just format
 * hints) so the CONVERSATION owns the inference budget, not boilerplate:
 * the whole prompt stays ≈ 2.5-3k tokens, comfortably inside Qwen2.5's
 * 32k-token context and the WASM wall-clock budget.
 */
const MAX_TRANSCRIPT_CHARS = 10_000;

/**
 * Render the speaker-tagged transcript into "AGENT:" / "CUSTOMER:" lines,
 * trimmed from the front so the most recent — most relevant — speech stays.
 */
/** Filler-only customer turns ("you", "yeah", "okay") — Whisper's rendering
 *  of back-channel acknowledgments. They confirm nothing specific, carry no
 *  ticket information, and pad the prompt for a small model, so they are
 *  excluded from what the LLM sees (the visible transcript keeps them).
 *  Deliberately excludes yes/no — those can be meaningful answers. */
const FILLER_ONLY_TURN =
  /^(?:you|u|yeah|yep|yup|ya|okay|ok|hm+|mhm+|mm+|uh+[- ]?huh+|oh?k?ay|alright|right|sure|great|perfect|awesome|cool|wow)\b[.!]??$/i;

/** Turn is pure ASR noise: an artifact tag or a filler acknowledgment */
function isNoiseTurn(text: string): boolean {
  const stripped = stripAsrArtifacts(text);
  if (stripped.length === 0) return true;
  return FILLER_ONLY_TURN.test(stripped.replace(/[',.]/g, ' ').replace(/\s+/g, ' ').trim());
}

/** One LLM prompt's view of the conversation: which entries made the cut */
export interface PromptWindow {
  /** Rendered prompt text (speaker-tagged, noise-stripped, tail-capped) */
  text: string;
  /** Indexes into the ORIGINAL entries array that the prompt includes */
  entryIndexes: number[];
  /** Prompt text length, after the cap */
  chars: number;
}

/**
 * Compute exactly what the LLM will see for a parse — the same slicing
 * `renderTranscript` performs, but also reporting WHICH entries are inside
 * the window. Powers the "what the AI sees" debug highlight in the caption
 * panel: with the transcript growing beyond MAX_TRANSCRIPT_CHARS, older
 * turns fall out of the window and (thanks to prior-value carry-forward)
 * only their extracted values survive.
 */
export function buildPromptWindow(entries: TranscriptEntry[]): PromptWindow {
  const kept: Array<{ index: number; line: string }> = [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (isNoiseTurn(e.text)) continue;
    const clean = stripAsrArtifacts(e.text);
    if (clean.length === 0) continue;
    kept.push({ index: i, line: `${e.speaker === 'agent' ? 'AGENT' : 'CUSTOMER'}: ${clean}` });
  }

  let lines = kept;
  let chars = kept.reduce((n, k) => n + k.line.length + 1, 0);
  if (chars > MAX_TRANSCRIPT_CHARS) {
    // Keep the TAIL: newest speech matters most for the evolving fields
    lines = [];
    chars = 0;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const len = kept[i].line.length + 1;
      if (chars + len > MAX_TRANSCRIPT_CHARS && lines.length > 0) break;
      lines.unshift(kept[i]);
      chars += len;
    }
  }

  return {
    text: lines.map((k) => k.line).join('\n'),
    entryIndexes: lines.map((k) => k.index),
    chars,
  };
}

export function renderTranscript(entries: TranscriptEntry[]): string {
  return buildPromptWindow(entries).text;
}

/**
 * Values the PREVIOUS parse produced, fed back into the next prompt.
 *
 * These fields keep evolving as the call goes on:
 *
 *  - resolutionSummary is cumulative: as the transcript window slides
 *    forward, early steps fall out of the context the model can see —
 *    without carrying them back in, a replace-semantics re-parse would
 *    silently DROP them.
 *  - issueDescription is refined in place: the customer keeps describing
 *    the problem (and the agent confirms/diagnoses it), so each new parse
 *    merges those details into the description already on the ticket
 *    rather than starting over from whatever still fits in the window.
 */
export interface PriorLlmValues {
  /** resolutionSummary the previous parse produced — the model must keep
   *  these steps and append any NEW ones after them */
  resolutionSummary?: string;
  /** issueDescription the previous parse produced — the model refines it
   *  with newly described symptoms/details; replaces it only when the
   *  conversation shows it was wrong */
  issueDescription?: string;
}

/**
 * Build the (system, user) prompt pair for a parse. The system prompt fixes
 * the output contract; the user prompt carries the full speaker-tagged
 * transcript, any previously extracted steps to carry forward, and the JSON
 * skeleton of the fields to extract.
 *
 * Callers normally pass every supported field: the LLM is the primary
 * parser and re-reads the whole conversation as it grows, so its
 * full-context understanding of the situation — not just the fields a
 * regex happened to miss — is what fills the form.
 *
 * `strict` renders the brevity-hardened variant used for the single retry
 * after a broken reply (truncated JSON, rambling): the reply must be only
 * the compact JSON object.
 */
/**
 * JSON skeleton key order for the model's reply. The fields ONLY the LLM can
 * produce (long free-text: description, type, resolution) come FIRST and the
 * format-verifiable identifiers (phone/email/serial/SKU — regex's home turf)
 * come LAST: if generation truncates mid-JSON, the salvage keeps the fields
 * no other engine can fill, and the lost tail is exactly what regex covers.
 */
const PROMPT_FIELD_ORDER = [
  'issueDescription',
  'issueType',
  'resolutionSummary',
  'customerName',
  'contactNumber',
  'emailAddress',
  'deebotModel',
  'skuNumber',
  'serialNumber',
  'purchaseInfo',
] as const;

export function buildParsePrompt(
  entries: TranscriptEntry[],
  missingFieldIds: readonly string[],
  prior?: PriorLlmValues,
  strict = false
): { system: string; user: string } {
  const wanted = missingFieldIds.filter((id): id is LlmFieldId =>
    (LLM_FIELD_IDS as readonly string[]).includes(id)
  );
  const order =
    wanted.length > 0
      ? PROMPT_FIELD_ORDER.filter((id) => (wanted as readonly string[]).includes(id))
      : [...PROMPT_FIELD_ORDER];
  const skeleton = Object.fromEntries(order.map((id) => [id, '']));

  const system = [
    'You write the ticket note for an Ecovacs robot support call (DEEBOT vacuums, GOAT lawn mowers, WINBOT window cleaners, ULTRAMARINE pool robots). AGENT is the support rep, CUSTOMER is the caller. The transcript is machine-garbled — read for INTENT, not literally ("Acovox" = ECOVACS, "free of the breeze" = free of debris).',
    'Reply with ONE JSON object only — no markdown, no explanations. Every value in condensed note style, "" when unknown, never invented.',
    '1. customerName / contactNumber / emailAddress: the CUSTOMER\'S own details (stated by the customer, or the agent reading them back) — never the agent\'s.',
    '2. deebotModel: the robot the call is about, as the speakers name it. Names look like "T30S", "X2 OMNI", "GOAT O1000 RTK", "Winbot W2", "ULTRAMARINE P1".',
    '3. skuNumber / serialNumber: identifiers either speaker read out, exactly as spoken.',
    '4. purchaseInfo: where + when the customer acquired the unit, one short phrase ("Amazon · March 2025", "Best Buy · ~2 years ago").',
    '5. issueDescription: ONE concise sentence of the customer\'s PRIMARY complaint in the customer\'s terms. When given a description already on the ticket, refine it — fold in NEW symptoms or details the customer describes or the agent confirms; never drop what it already has.',
    '6. issueType: the "Category::Item" matching the primary problem (e.g. "Failure::Unable to charge", "Product experience::Low suction power", "How to use::App connection").',
    '7. resolutionSummary: EVERY step the agent advised, in order — each a short imperative verb phrase (3-10 words) joined with " -> ", ASR garble fixed. Your reply REPLACES the previous extraction: include the steps you are given PLUS any new ones.',
    ...(strict
      ? [
          'CRITICAL: output ONLY the compact JSON object — every value at most a few words, the whole reply as short as possible, no text before or after it.',
        ]
      : []),
  ].join('\n');

  const userLines = ['Support call transcript:', renderTranscript(entries)];
  if (prior?.issueDescription) {
    userLines.push(
      '',
      'Issue description already on the ticket (refine it: fold in any NEW symptoms or details the customer describes or the agent confirms; only replace it if the conversation proves it wrong):',
      prior.issueDescription
    );
  }
  if (prior?.resolutionSummary) {
    userLines.push(
      '',
      'Steps already on the ticket (keep them unchanged and in order, then append any NEW steps after them):',
      prior.resolutionSummary
    );
  }
  userLines.push(
    '',
    `Extract these ticket fields as JSON ("" when unknown): ${JSON.stringify(skeleton)}`
  );

  return { system, user: userLines.join('\n') };
}

// ---------------------------------------------------------------------------
//  Paraphrasing stage — vernacular speech → concise note style
// ---------------------------------------------------------------------------

/**
 * The two free-text fields the paraphrasing stage polishes. The regex engine
 * accumulates VERBATIM clauses lifted from live speech (filler words,
 * back-channel noise, ASR garble included); this stage rewrites them into
 * the concise professional style a support ticket note expects.
 */
export interface ParaphraseInput {
  /** Verbatim customer-complaint clauses the regex engine collected */
  issueDescription?: string;
  /** Verbatim agent TBS steps the regex engine collected */
  resolutionSummary?: string;
}

/**
 * Build the (system, user) prompt pair for a paraphrase pass.
 *
 * This is deliberately a MUCH simpler contract than the extraction parse —
 * two strings in, two strings out — so an ultra-small model that struggles
 * with the 10-field JSON contract can still polish the vernacular text the
 * regex engine provisionally filled (and when the extraction parse works,
 * its condensed output supersedes this stage entirely).
 */
export function buildParaphrasePrompt(input: ParaphraseInput): {
  system: string;
  user: string;
} {
  const system = [
    'You polish the notes for Ecovacs robot support calls (DEEBOT vacuums, GOAT lawn mowers, WINBOT window cleaners, ULTRAMARINE pool cleaners).',
    'The input is VERBATIM fragments a pattern engine lifted from a machine-transcribed support call: the customer\'s vernacular complaint clauses and the agent\'s troubleshooting advice, with filler words, repetition, back-channel noise and transcription errors.',
    'Rewrite each fragment list into the concise, professional style of a support-ticket note.',
    'Reply with ONE JSON object and nothing else. No markdown, no explanations.',
    'Rules:',
    '1. issueDescription: ONE concise sentence (max ~25 words) summarizing the customer\'s PRIMARY problem in the customer\'s own terms — merge related clauses into one statement, drop filler, repetition and back-channel noise.',
    '2. resolutionSummary: EVERY distinct step, recommendation or option the agent gave, in order. Condense each into a short imperative phrase starting with a verb (3-10 words). Join the phrases with " -> ". NEVER drop a step — a missing step is a missing ticket entry.',
    '3. Fix obvious transcription errors from context (e.g. "econovac" → "ecovacs", "goat leave as 1000" → "GOAT lawn mower", "RTK/RDK" is the positioning module).',
    '4. Copy "" for a field whose input is empty. NEVER invent facts, steps, prices, dates or values that are not in the input.',
    'Example — input issueDescription fragments: "it just would, it would go down and back three or four times and stop; have this blinking system of a 1 and then a dash across the top and then a 1 and go around and around and then it would time out"',
    '→ issueDescription: "Mower stops after a few passes and shows a repeating 1-1 error code, then times out"',
  ].join('\n');

  const userLines = ['Verbatim transcript fragments to condense:'];
  userLines.push(`issueDescription fragments: ${JSON.stringify(input.issueDescription ?? '')}`);
  userLines.push(`resolutionSummary fragments: ${JSON.stringify(input.resolutionSummary ?? '')}`);
  userLines.push('', 'Reply with the JSON object now.');

  return { system, user: userLines.join('\n') };
}

/**
 * Validate a paraphrase reply into ExtractedFields: only the two free-text
 * keys are honored, values are whitespace-collapsed and capped like every
 * other LLM value, and blank strings are dropped. Returns [] when the reply
 * held nothing usable — the verbatim regex fill then stands.
 */
export function validateParaphraseReply(raw: Record<string, unknown>): ExtractedField[] {
  const out: ExtractedField[] = [];
  const keys: Array<keyof ParaphraseInput> = ['issueDescription', 'resolutionSummary'];
  for (const key of keys) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (isBlank(cleaned)) continue;
    const cap = FIELD_VALUE_CAPS[key] ?? 200;
    out.push({
      fieldId: key,
      value: cleaned.length > cap ? cleaned.slice(0, cap).trimEnd() : cleaned,
      confidence: 'low',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Output validation
// ---------------------------------------------------------------------------

/** Field-specific caps so a rambling model cannot flood the form */
const FIELD_VALUE_CAPS: Record<string, number> = {
  customerName: 60,
  contactNumber: 24,
  emailAddress: 80,
  deebotModel: 40,
  skuNumber: 32,
  serialNumber: 40,
  purchaseInfo: 120,
  issueType: 80,
  issueDescription: 400,
  resolutionSummary: 600,
};

/** Pull the first balanced JSON object out of a raw LLM reply */
export function extractJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const fenced = raw.replace(/```(?:json)?/gi, '');
  const start = fenced.indexOf('{');
  if (start < 0) return null;
  // Scan for the matching closing brace (string-aware)
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < fenced.length; i += 1) {
    const ch = fenced[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(fenced.slice(start, i + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
          return null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Loose variant used on model replies: the balanced-object scan first, and
 * when that fails (generation truncated mid-JSON — the classic signature of
 * a reply that hit the token cap or a model that rambled) salvage the
 * COMPLETE "key":"value" pairs from the raw text instead of throwing the
 * whole reply away. A truncated reply then still yields every field that
 * did complete.
 *
 * Keys not in LLM_FIELD_IDS are ignored; the first occurrence of a key
 * wins (rambling repetition usually repeats the same value).
 */
export function extractJsonLoose(raw: string): Record<string, unknown> | null {
  const strict = extractJson(raw);
  if (strict) return strict;

  const salvaged: Record<string, unknown> = {};
  const pair = /"([a-zA-Z]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = pair.exec(raw))) {
    const key = m[1];
    if (!(LLM_FIELD_IDS as readonly string[]).includes(key)) continue;
    if (key in salvaged) continue;
    try {
      salvaged[key] = JSON.parse(`"${m[2]}"`);
    } catch {
      /* malformed escape sequence in the value — skip this pair */
    }
  }
  return Object.keys(salvaged).length > 0 ? salvaged : null;
}

/** Normalize a phone number read out digit-by-digit-ish ("two one two...") */
function sanitizePhone(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value.replace(/\s+/g, ' ').trim();
}

/** Normalize a spoken email ("john at gmail dot com") */
function sanitizeEmail(value: string): string {
  return value
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s+dot\s+/gi, '.')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** True when a value is empty/placeholder-ish ("", "n/a", "unknown") */
function isBlank(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === '' || v === 'n/a' || v === 'na' || v === 'none' || v === 'null' || v === 'unknown';
}

/**
 * Validate + canonicalize the LLM's JSON into ExtractedFields.
 *
 *  - unknown field ids are dropped;
 *  - models must match a canonical combobox option (hallucinated names out);
 *  - issue types are canonicalized, falling back to the keyword classifier
 *    over the LLM's text, then to a trimmed free-text label;
 *  - emails/phones are normalized from spoken phrasing;
 *  - values are length-capped.
 *
 * Returns only fields with a non-empty validated value.
 */
export function validateLlmFields(raw: Record<string, unknown>): ExtractedField[] {
  const out: ExtractedField[] = [];

  for (const fieldId of LLM_FIELD_IDS) {
    const value = raw[fieldId];
    if (typeof value !== 'string') continue;
    let cleaned = value.replace(/\s+/g, ' ').trim();
    if (isBlank(cleaned)) continue;

    switch (fieldId) {
      case 'deebotModel': {
        // Canonicalize onto the fleet list when the model's naming maps
        // to it ("O1000 RTK" → GOAT O1000 RTK, ASR zero/O confusion
        // included). When it does NOT map, the prompt deliberately carries
        // no model list — keep the model's own naming as-is: a free-text
        // model on the form (flagged for verification) beats an empty
        // field. Only obvious noise (single characters) is dropped.
        if (cleaned.length < 2) continue;
        cleaned = matchCanonicalModel(cleaned) ?? cleaned;
        break;
      }
      case 'contactNumber': {
        // A real phone number has ≥7 digits; a hallucinated word like
        // "number" or "unknown" has none and must be dropped
        if (cleaned.replace(/\D/g, '').length < 7) continue;
        cleaned = sanitizePhone(cleaned);
        break;
      }
      case 'emailAddress':
        cleaned = sanitizeEmail(cleaned);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) continue;
        break;
      case 'skuNumber':
      case 'serialNumber':
        // Real identifiers contain digits — reject words the model lifted
        // from the conversation ("number", "serial number as well")
        if (!/\d/.test(cleaned)) continue;
        break;
      case 'issueType': {
        // Fuzzy-match against the ~800 canonical options; when the LLM
        // phrased a complaint ("won't charge") run the keyword classifier;
        // otherwise keep the (trimmed) free-text label as a custom value
        const canonical =
          canonicalIssueType(cleaned) ?? classifyIssueType(cleaned);
        cleaned = canonical ?? cleaned;
        break;
      }
      case 'customerName': {
        // Title-case names the model lower-cased; strip honorifics
        cleaned = cleaned.replace(/\b(?:mr|mrs|ms|miss|dr)\.?\s+/gi, '');
        cleaned = cleaned
          .split(' ')
          .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w))
          .join(' ');
        if (cleaned.length < 2) continue;
        break;
      }
      default:
        break;
    }

    const cap = FIELD_VALUE_CAPS[fieldId] ?? 200;
    if (cleaned.length > cap) cleaned = cleaned.slice(0, cap).trimEnd();
    if (cleaned.length === 0) continue;

    out.push({ fieldId, value: cleaned, confidence: 'low' });
  }

  return out;
}
