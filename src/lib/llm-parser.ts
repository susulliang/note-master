/**
 * Ultra-small local LLM — the PRIMARY ticket-field parser.
 *
 * An on-device instruction-following LLM (transformers.js v3, WASM) reads the
 * WHOLE speaker-tagged conversation — agent and customer speech together —
 * and maps it onto the ticket form. Pattern matching (the regex engine in
 * src/lib/field-extraction.ts) is relegated to a provisional stopgap: it may
 * pre-fill format-verifiable identifiers while the model is unavailable, and
 * everything it fills is provisional until the LLM's full-context reading of
 * the situation replaces it. Audio and transcript never leave the machine:
 * there is no API key and no per-request cost, just a one-time model
 * download cached by the browser.
 *
 * Model choices are deliberately tiny so CPU/WASM inference stays tolerable:
 *
 *   smollm2-360m — HuggingFaceTB/SmolLM2-360M-Instruct (default; ~360M
 *                  params, fastest sensible extraction quality)
 *   qwen2.5-0.5b — onnx-community/Qwen2.5-0.5B-Instruct (smarter, heavier)
 *
 * Validation is the critical piece: the LLM may hallucinate. Everything it
 * returns is clamped against the canonical option lists (Deebot models,
 * issue types) and any field it cannot justify is dropped, so the yellow
 * glow never marks a fabricated value.
 */

import { DEEBOT_MODELS } from '@/data/ticket';
import type { TranscriptEntry, ExtractedField } from '@/lib/field-extraction';
import { matchCanonicalModel, canonicalIssueType, classifyIssueType } from '@/lib/field-extraction';

// ---------------------------------------------------------------------------
//  Model registry
// ---------------------------------------------------------------------------

/** Hugging Face repo per selectable model */
export const LOCAL_LLM_MODELS = {
  'smollm2-360m': 'HuggingFaceTB/SmolLM2-360M-Instruct',
  'qwen2.5-0.5b': 'onnx-community/Qwen2.5-0.5B-Instruct',
} as const;

export type LlmModelName = keyof typeof LOCAL_LLM_MODELS;

export const DEFAULT_LLM_MODEL: LlmModelName = 'smollm2-360m';

export const LLM_MODEL_META: Record<LlmModelName, { label: string; note: string }> = {
  'smollm2-360m': {
    label: 'SmolLM2 360M',
    note: 'Primary AI parser · ~200 MB one-time download',
  },
  'qwen2.5-0.5b': {
    label: 'Qwen2.5 0.5B',
    note: 'Sharper AI parser · ~350 MB one-time download',
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
  'issueDescription',
  'issueType',
  'resolutionSummary',
] as const;

export type LlmFieldId = (typeof LLM_FIELD_IDS)[number];

/** How many transcript characters to feed the model — small LLMs get lost
 *  in long contexts, and WASM inference cost grows with every token. The cap
 *  is generous because the model needs BOTH sides of the conversation to
 *  understand the situation. */
const MAX_TRANSCRIPT_CHARS = 3000;

/** Issue-type examples for the prompt (full list is ~800 entries) */
const ISSUE_TYPE_EXAMPLES = [
  'Failure::Unable to charge/fully charge',
  'Failure::Unable to power on the robot',
  'Failure::Unable to return to station',
  'Failure::Robot spins in circles or moves backward',
  'Failure::Fails to escape when stuck',
  'Failure::Robot making abnormal sound/noise',
  'Failure::Network setup failed',
  'Failure::App crashing',
  'Failure::Lost map',
  'Failure::Error code',
  'Product experience::Low suction power',
  'Product experience::Carpets get wet during mopping',
  'Missing parts::Side brush missing',
  'Damaged parts::Damaged power cord',
  'Return Request::Return and exchange application',
  'Aftersale-Service inquiry::Warranty Policy',
  'How to use::App connection',
  'How to use::Scheduling',
];

/**
 * Render the speaker-tagged transcript into "AGENT:" / "CUSTOMER:" lines,
 * trimmed from the front so the most recent — most relevant — speech stays.
 */
export function renderTranscript(entries: TranscriptEntry[]): string {
  const lines = entries.map((e) => `${e.speaker === 'agent' ? 'AGENT' : 'CUSTOMER'}: ${e.text}`);
  let text = lines.join('\n');
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text = text.slice(text.length - MAX_TRANSCRIPT_CHARS);
    // Start at a clean line boundary
    const nl = text.indexOf('\n');
    if (nl > 0) text = text.slice(nl + 1);
  }
  return text;
}

/**
 * Values the PREVIOUS parse produced, fed back into the next prompt.
 *
 * Resolution steps are cumulative: as the transcript window slides forward,
 * early steps fall out of the context the model can see — without carrying
 * them back in, a replace-semantics re-parse would silently DROP them.
 */
export interface PriorLlmValues {
  /** resolutionSummary the previous parse produced — the model must keep
   *  these steps and append any NEW ones after them */
  resolutionSummary?: string;
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
export function buildParsePrompt(
  entries: TranscriptEntry[],
  missingFieldIds: readonly string[],
  prior?: PriorLlmValues,
  strict = false
): { system: string; user: string } {
  const wanted = missingFieldIds.filter((id): id is LlmFieldId =>
    (LLM_FIELD_IDS as readonly string[]).includes(id)
  );
  const skeleton = Object.fromEntries(
    (wanted.length > 0 ? wanted : [...LLM_FIELD_IDS]).map((id) => [id, ''])
  );

  const system = [
    'You are the ticket-note writer for Ecovacs robot-vacuum support calls.',
    'You read a transcript where AGENT is the support rep and CUSTOMER is the caller.',
    'First understand the whole situation from BOTH speakers together — what the customer complained about, what the agent diagnosed and advised — then extract the ticket fields.',
    'Reply with ONE JSON object and nothing else. No markdown, no explanations.',
    'Keep every value SHORT — condensed note style, never sentences copied verbatim from the transcript.',
    'Rules:',
    '1. customerName / contactNumber / emailAddress are the CUSTOMER\'S own details: take them from the customer stating them, or from the agent reading them back to confirm ("so that\'s John, 555-0123"). NEVER use the agent\'s own name as the customer name.',
    '2. deebotModel: copy EXACTLY one name from the allowed list below, or "". Take it from the customer\'s own words, the agent\'s question ("is it the X2 OMNI?"), or the customer confirming/correcting the agent\'s guess. Choose the model the call is actually about.',
    '3. skuNumber / serialNumber: identifiers either speaker read out, exactly as spoken.',
    '4. issueDescription: ONE concise sentence summarizing the customer\'s complaint as understood from the whole conversation — what is wrong with the machine, in the customer\'s terms.',
    '5. issueType: the single best "Category::Item" match for that complaint. Pick from the examples below when one fits, otherwise write a short "Category::Item" of your own.',
    '6. resolutionSummary: EVERY troubleshooting step the AGENT advised during this call, in order. Condense each step to a short imperative phrase starting with a verb (3-10 words). Join the steps with " -> ". Fix obvious speech-transcription errors from context. Your reply REPLACES the previous extraction, so include ALL steps — the ones you are given as already noted PLUS any new ones.',
    '7. Use "" for any field the conversation does not clearly state. Never invent values.',
    'Example of resolutionSummary condensation — AGENT said: "can you make sure the clean water tank is properly seated and the valves themselves are probably tight, so if you take out the clean water tank there should be like a valve there, and then make sure that thing is secure and free of the breeze and then put the water tank back in"',
    '→ resolutionSummary: "check clean water tank\'s tightness -> make sure valve is free of debris -> put water tank back in" ("free of the breeze" is a transcription error for "free of debris"; verbatim copying is wrong)',
    'Allowed deebotModel values: ' + DEEBOT_MODELS.join(', '),
    'issueType examples: ' + ISSUE_TYPE_EXAMPLES.join(' | '),
    ...(strict
      ? [
          'CRITICAL: output ONLY the compact JSON object — every value at most a few words, the whole reply as short as possible, no text before or after it.',
        ]
      : []),
  ].join('\n');

  const userLines = ['Support call transcript:', renderTranscript(entries)];
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
        const canonical = matchCanonicalModel(cleaned);
        if (!canonical) continue; // hallucinated model — reject
        cleaned = canonical;
        break;
      }
      case 'contactNumber':
        cleaned = sanitizePhone(cleaned);
        break;
      case 'emailAddress':
        cleaned = sanitizeEmail(cleaned);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) continue;
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
