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
import { matchCanonicalModel, canonicalIssueType, classifyIssueType, stripAsrArtifacts, canonicalPurchaseChannel, formatPurchaseValue } from '@/lib/field-extraction';

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
 * Approximate resident-memory footprint per model + precision (MB) — the
 * fallback RAM badge when the worker cannot measure its own heap
 * (performance.memory is main-thread-only in Chromium, absent elsewhere).
 * Weights + ONNX runtime + context: rough but the right order of magnitude.
 */
export const LLM_RAM_ESTIMATE_MB: Record<LlmModelName, Record<LlmDtype, number>> = {
  'smollm2-360m': { q8: 300, fp32: 900, fp16: 500, q4f16: 250 },
  'qwen2.5-0.5b': { q8: 450, fp32: 1400, fp16: 800, q4f16: 400 },
  'qwen2.5-1.5b': { q8: 1100, fp32: 3400, fp16: 2000, q4f16: 1000 },
};

export type LlmDtype = 'q8' | 'fp32' | 'fp16' | 'q4f16';

/**
 * WASM/CPU precision chain, mirroring the Whisper setup: `q8` first (small
 * download, well-supported by the WASM execution provider), `fp32` as the
 * larger escape hatch for exports the runtime cannot instantiate.
 */
export const LLM_DTYPE_CHAIN: readonly LlmDtype[] = ['q8', 'fp32'];

/**
 * WebGPU precision chain. q4f16 (4-bit weights, fp16 compute) is THE
 * WebGPU format — ~5x less weight traffic than fp32, which on a
 * shared-memory iGPU is the difference between a ~10s prefill and a
 * bandwidth-starved 60s timeout. fp16 (half traffic) and fp32 stay as
 * error-fallbacks for runtimes/drivers that reject q4f16 graphs.
 */
export const LLM_DTYPE_CHAIN_WEBGPU: readonly LlmDtype[] = ['q4f16', 'fp16', 'fp32'];

// ---------------------------------------------------------------------------
//  Worker protocol (main thread ⇆ src/workers/llm-parser.worker.ts)
// ---------------------------------------------------------------------------

export interface LlmLoadMessage {
  type: 'load';
  model: LlmModelName;
  dtype?: LlmDtype;
  /**
   * Explicit backend request from the download manager: 'gpu' forces
   * WebGPU (+fp32), 'cpu' forces wasm (q8/fp32 chain). Undefined keeps
   * the auto order (GPU when available, else wasm).
   */
  device?: 'gpu' | 'cpu';
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

export type LlmWorkerRequest =
  | LlmLoadMessage
  | LlmParseMessage
  | { type: 'reset' };

export type LlmWorkerEvent =
  | { type: 'load-start'; model: LlmModelName }
  | { type: 'progress'; model: LlmModelName; progress: number }
  | {
      type: 'ready';
      model: LlmModelName;
      dtype: LlmDtype;
      device: LlmDevice;
      /** Which variants were TRIED and rejected before this one worked —
       *  the download manager shows why e.g. gpu/fp32 failed */
      failedAttempts?: Array<{ device: LlmDevice; dtype: LlmDtype; message: string }>;
    }
  | {
      type: 'load-error';
      model: LlmModelName;
      message: string;
      failedAttempts?: Array<{ device: LlmDevice; dtype: LlmDtype; message: string }>;
    }
  | { type: 'gen-progress'; id: number; generated: number; maxNewTokens: number }
  | { type: 'result'; id: number; text: string; ms: number }
  | { type: 'parse-error'; id: number; message: string }
  | { type: 'mem-stats'; heapUsedMb: number; heapLimitMb: number };

/** Execution backend the pipeline actually initialized on */
export type LlmDevice = 'gpu' | 'cpu';

/**
 * Make a raw load error readable. ORT-WebGPU surfaces device failures as
 * bare unsigned ints (e.g. 3999415816 = 0xEE06xxxx = WebGPU device lost —
 * the GPU reset mid-upload: VRAM exhaustion or a driver TDR timeout), and
 * "3999415816" tells the agent nothing. Map the known signatures to plain
 * language with the recovery the app already performs.
 */
export function describeLoadError(raw: string): string {
  // WebGPU device-lost codes: 0xEE06xxxx range as unsigned decimal
  const n = /^(\d{8,10})$/.exec(raw.trim())?.[1];
  if (n) {
    const v = Number(n);
    if (v >= 0xee000000 && v <= 0xeeffffff) {
      return `WebGPU device lost (${n}) — the GPU reset while uploading the model (VRAM pressure or a driver timeout). Not a hardware failure.`;
    }
  }
  if (/device (has been )?lost/i.test(raw)) {
    return `${raw} — the GPU reset mid-load (VRAM pressure or driver timeout). Not a hardware failure.`;
  }
  if (/out of memory|oom/i.test(raw)) {
    return `${raw} — not enough GPU/CPU memory for this build; try a smaller model.`;
  }
  return raw;
}

/** Snapshot of the worker's JS heap — powers the RAM badge */
export interface LlmMemStats {
  /** MB currently used by the worker's JS heap */
  heapUsedMb: number;
  /** MB heap ceiling the browser granted the worker */
  heapLimitMb: number;
}

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
 * model — the TAIL (newest) of the conversation.
 *
 * ~4000 chars ≈ 4 minutes of speech. Field data: a 10k-char window made
 * CPU/WASM generation time out entirely (90s wall, no reply), so the
 * window now keeps only the newest conversation slice; older turns slide
 * out and their extracted values are carried forward instead (see
 * PriorLlmValues). The system prompt is deliberately minimal (~600
 * tokens: no model list, no issue-type catalog — just format hints) so
 * the CONVERSATION owns the inference budget, not boilerplate: the whole
 * prompt stays ≈ 1.5k tokens, comfortably inside Qwen2.5's 32k-token
 * context and the WASM wall-clock budget.
 */
const MAX_TRANSCRIPT_CHARS = 4_000;

/**
 * CPU/WASM variant of the cap. Prefill is THE bottleneck on WASM: field
 * data showed a ~1.3k-token prompt (4k-char window + system prompt)
 * blowing the whole 120s wall budget before the FIRST output token —
 * "gen 0.0s · wall 120.0s · TIMED OUT". A tighter tail window cuts
 * prompt-processing time roughly in half; older turns still contribute
 * through the prior-values carry-forward, so recall is preserved. The
 * GPU path keeps the full window — WebGPU prefill is negligible.
 */
const MAX_TRANSCRIPT_CHARS_CPU = 2_500;

/** Transcript-window cap for the backend the parser is running on. */
export function getTranscriptCharCap(device?: 'gpu' | 'cpu' | null): number {
  return device === 'cpu' ? MAX_TRANSCRIPT_CHARS_CPU : MAX_TRANSCRIPT_CHARS;
}

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

/** Turn is pure ASR noise: an artifact tag, a filler acknowledgment, or a
 *  punctuation-only leftover (">> [INAUDIBLE]" strips down to ">>" — chat
 *  speaker markers carry no speech) */
function isNoiseTurn(text: string): boolean {
  const stripped = stripAsrArtifacts(text);
  if (stripped.length === 0) return true;
  if (!/[a-z0-9]/i.test(stripped)) return true;
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
export function buildPromptWindow(
  entries: TranscriptEntry[],
  maxChars: number = MAX_TRANSCRIPT_CHARS
): PromptWindow {
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
  if (chars > maxChars) {
    // Keep the TAIL: newest speech matters most for the evolving fields
    lines = [];
    chars = 0;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      const len = kept[i].line.length + 1;
      if (chars + len > maxChars && lines.length > 0) break;
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

export function renderTranscript(
  entries: TranscriptEntry[],
  maxChars: number = MAX_TRANSCRIPT_CHARS
): string {
  return buildPromptWindow(entries, maxChars).text;
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
 *  - issueDescription accumulates clause by clause: the customer keeps
 *    describing the problem (and the agent confirms/diagnoses it), and the
 *    contract is recall-first — every point already on the ticket is fed
 *    back so a window slide can never lose it, and the model appends the
 *    new points after them. A human deletes irrelevant clauses later.
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
  strict = false,
  /**
   * 'simple' — plain "field: value" lines — is now the PRIMARY format.
   * Field data: JSON replies timed out at 0 output tokens (prompt
   * processing alone exceeded the budget on CPU/WASM), while line output
   * has no punctuation contract to hold, cannot break structurally, and
   * lets generation start immediately. 'json' remains available as the
   * denser alternative for callers that want it.
   */
  format: 'simple' | 'json' = 'simple',
  /** Transcript-window cap — see getTranscriptCharCap (CPU gets a tighter tail) */
  maxChars: number = MAX_TRANSCRIPT_CHARS
): { system: string; user: string } {
  const wanted = missingFieldIds.filter((id): id is LlmFieldId =>
    (LLM_FIELD_IDS as readonly string[]).includes(id)
  );
  const order =
    wanted.length > 0
      ? PROMPT_FIELD_ORDER.filter((id) => (wanted as readonly string[]).includes(id))
      : [...PROMPT_FIELD_ORDER];
  // Seed the EVOLVING fields with their prior values: the model only has
  // to EDIT the structure it is handed (append new clauses) instead of
  // re-deriving the whole list from prose instructions. Field data showed
  // prose-only carry-forward froze both boxes on the small models — they
  // either echoed the prose or dropped it; a pre-filled skeleton makes the
  // old clauses part of the reply's own structure.
  const skeleton = Object.fromEntries(
    order.map((id) => [
      id,
      id === 'issueDescription' && prior?.issueDescription
        ? prior.issueDescription
        : id === 'resolutionSummary' && prior?.resolutionSummary
          ? prior.resolutionSummary
          : '',
    ])
  );

  // ---- SIMPLE format (PRIMARY): plain lines ------------------------------
  // Line labels cannot break structurally — each line stands alone, so a
  // truncated reply still yields every line that completed, and generation
  // starts without the model having to plan a punctuation-perfect object.
  if (format === 'simple') {
    const system = [
      'You write the ticket note for an Ecovacs robot support call (DEEBOT vacuums, GOAT lawn mowers, WINBOT window cleaners, ULTRAMARINE pool robots). AGENT is the support rep, CUSTOMER is the caller. The transcript is machine-garbled — read for INTENT, not literally ("Acovox" = ECOVACS).',
      'Reply with ONE LINE PER FIELD, exactly this shape (no JSON, no braces, no quotes, no explanations):',
      'customerName: <the customer\'s own name, or empty>',
      'contactNumber: <their phone number, or empty>',
      'emailAddress: <their email, or empty>',
      'deebotModel: <the robot model, e.g. T30S / X2 OMNI / GOAT O1000 RTK, or empty>',
      'skuNumber: <SKU as spoken, or empty>',
      'serialNumber: <serial as spoken, or empty>',
      'purchaseInfo: <store + when, e.g. "Amazon · March 2025", or empty>',
      'issueDescription: <EVERY distinct customer point, short clauses joined with "; ", or empty>',
      'issueType: <"Category::Item" or short phrase, or empty>',
      'resolutionSummary: <EVERY agent step/advice/question, short phrases joined with " -> ", or empty>',
      'Rules: values in condensed note style, never invented; keep every clause of a field whose current value is given in the input; append new points after them.',
      ...(strict
        ? ['CRITICAL: only the eleven lines, as short as possible, nothing else.']
        : []),
    ].join('\n');
    const userLines = ['Support call transcript:', renderTranscript(entries, maxChars)];
    if (prior?.issueDescription) {
      userLines.push('', 'issueDescription currently:', prior.issueDescription);
    }
    if (prior?.resolutionSummary) {
      userLines.push('', 'resolutionSummary currently:', prior.resolutionSummary);
    }
    userLines.push('', 'Reply with the eleven lines now, one per field.');
    return { system, user: userLines.join('\n') };
  }

  const system = [
    'You write the ticket note for an Ecovacs robot support call (DEEBOT vacuums, GOAT lawn mowers, WINBOT window cleaners, ULTRAMARINE pool robots). AGENT is the support rep, CUSTOMER is the caller. The transcript is machine-garbled — read for INTENT, not literally ("Acovox" = ECOVACS, "free of the breeze" = free of debris).',
    'Reply with ONE JSON object only — no markdown, no explanations. Every value in condensed note style, "" when unknown, never invented.',
    '1. customerName / contactNumber / emailAddress: the CUSTOMER\'S own details (stated by the customer, or the agent reading them back) — never the agent\'s.',
    '2. deebotModel: the robot the call is about, as the speakers name it. Names look like "T30S", "X2 OMNI", "GOAT O1000 RTK", "Winbot W2", "ULTRAMARINE P1".',
    '3. skuNumber / serialNumber: identifiers either speaker read out, exactly as spoken.',
    '4. purchaseInfo: where + when the unit was acquired — store/site first (Amazon, Best Buy, eBay, Target, Walmart, Costco, Home Depot, ecovacs.com / official store, ...), then when ("Amazon · March 2025", "Ecovacs official store · ~1 year ago").',
    '5. issueDescription: recall over brevity — EVERY distinct point the CUSTOMER makes, each condensed into its own short clause (a few words) and joined with "; ": symptoms and their history (when it started, what changed, what they already tried), context (age, purchase, usage), requests (order/replace a part or accessory, a missing or misplaced item, how-to), plus problem details the agent states. NEVER omit a point to stay short — a human deletes irrelevant clauses later. When given a description already on the ticket, keep every clause of it and append the NEW points.',
    '6. issueType: the "Category::Item" matching the primary problem (e.g. "Failure::Unable to charge", "Product experience::Low suction power", "Aftersale-Service inquiry::Accessory Purchase", "How to use::App connection").',
    '7. resolutionSummary: EVERY step, recommendation and question the agent made, in order — advice as short imperative phrases (3-10 words), questions as terse past-tense checks ("checked power state?", "wifi changed recently?"), joined with " -> ", ASR garble fixed. REPLACES the previous extraction: keep the given steps plus new ones.',
    ...(strict
      ? [
          'CRITICAL: output ONLY the compact JSON object — every value at most a few words, the whole reply as short as possible, no text before or after it.',
        ]
      : []),
  ].join('\n');

  const userLines = ['Support call transcript:', renderTranscript(entries, maxChars)];
  if (prior?.issueDescription) {
    userLines.push(
      '',
      'Issue description clauses already on the ticket (keep EVERY one of them; append NEW points the customer describes or the agent confirms — never drop a clause):',
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
    `Extract these ticket fields as JSON ("" when unknown; the two fields already hold the ticket's current value — keep ALL of it and append any NEW clauses from the transcript): ${JSON.stringify(skeleton)}`
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
    '1. issueDescription: recall over brevity — EVERY distinct point from the customer fragments, each condensed into its own short clause (a few words) and joined with "; ". Merge related clauses, drop only pure filler, repetition and back-channel noise. NEVER omit a point to stay short — a human deletes irrelevant clauses later.',
    '2. resolutionSummary: EVERY distinct step, recommendation, option or question the agent gave, in order. Advice condenses to a short imperative phrase starting with a verb (3-10 words); questions condense to terse past-tense checks ("checked power state?", "wifi changed recently?"). Join the phrases with " -> ". NEVER drop a step — a missing step is a missing ticket entry.',
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

/** Field-specific caps so a rambling model cannot flood the form. The
 *  issueDescription cap is deliberately generous: the contract is
 *  recall-first (every customer point as its own clause) and a human
 *  trims later — a tight cap here would silently delete exactly the
 *  information this stage exists to catch. */
const FIELD_VALUE_CAPS: Record<string, number> = {
  customerName: 60,
  contactNumber: 24,
  emailAddress: 80,
  deebotModel: 40,
  skuNumber: 32,
  serialNumber: 40,
  purchaseInfo: 120,
  issueType: 80,
  issueDescription: 1000,
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

/**
 * SIMPLE-FORMAT extractor: "key: value" lines, no JSON punctuation at all.
 *
 * The strict-retry fallback for models that cannot hold the JSON contract
 * (unbalanced braces, quotes-inside-values, truncation — all the classic
 * small-model failure modes). Line labels are trivial for even a 360M model
 * to emit and cannot be structurally broken: every line stands alone, so a
 * truncated reply still yields every line that completed. Accepted forms:
 *
 *   customerName: Dan Knight
 *   contact number: (310) 173-4037      ← spoken labels tolerated
 *   issueDescription: stops after a few passes
 *   - resolutionSummary: reset the machine      ← leading bullets tolerated
 *
 * Blank / placeholder values ("n/a", '""') are dropped by the shared
 * validateLlmFields, exactly as on the JSON path.
 */
const LINE_LABELS: Record<string, string> = {
  customername: 'customerName',
  name: 'customerName',
  contactnumber: 'contactNumber',
  phone: 'contactNumber',
  phonenumber: 'contactNumber',
  emailaddress: 'emailAddress',
  email: 'emailAddress',
  deebotmodel: 'deebotModel',
  model: 'deebotModel',
  skunumber: 'skuNumber',
  sku: 'skuNumber',
  serialnumber: 'serialNumber',
  serial: 'serialNumber',
  purchaseinfo: 'purchaseInfo',
  purchase: 'purchaseInfo',
  issuedescription: 'issueDescription',
  issue: 'issueDescription',
  issuetype: 'issueType',
  resolutionsummary: 'resolutionSummary',
  resolution: 'resolutionSummary',
};

export function extractLineFields(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const out: Record<string, unknown> = {};
  for (const line of raw.split(/\r?\n/)) {
    // Leading bullets/dashes/quotes tolerated; label up to the first colon
    const m = line.match(/^\s*[-*•"']*\s*([A-Za-z][A-Za-z ]{1,30}?)\s*:\s*(.+)$/);
    if (!m) continue;
    const fieldId = LINE_LABELS[m[1].toLowerCase().replace(/\s+/g, '')];
    if (!fieldId || fieldId in out) continue;
    let value = m[2].trim();
    // Strip wrapping quotes the model may still emit around values
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    value = value.trim();
    if (value.length === 0) continue;
    out[fieldId] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
//  LLM-first cleanup helpers
//
//  Rule: the LLM's parsed value is ALWAYS the primary source. Regex / format
//  checks CLEAN the value when they can, but MUST NOT drop (block) a value
//  just because it didn't match a shape — only purely empty CATEGORY labels
//  ("the contact number", "no email provided", "sku") that carry ZERO
//  payload content are still filtered out. A spoken-word phone number
//  ("five five five one two three four"), a digit-free serial (ALPHA-BRAVO),
//  or an email the LLM wrote oddly are all kept — the agent can proofread
//  a slightly malformed value; they cannot proofread a value that was
//  silently erased.
// ---------------------------------------------------------------------------

/** English digit word → digit. Covers 0–19, decades, and the common "oh"/"o"
 *  ASR spelling for zero inside digit sequences ("two one oh" → 210). */
const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: '0', oh: '0', o: '0',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50',
  sixty: '60', seventy: '70', eighty: '80', ninety: '90',
};

/** Replace standalone English number-words with their digits. Existing digits
 *  and non-number words pass through untouched. */
function wordsToDigits(text: string): string {
  return text.replace(/[A-Za-z]+/g, (word) => {
    const hit = NUMBER_WORDS[word.toLowerCase()];
    return hit ?? word;
  });
}

/**
 * Pure CATEGORY-LABEL placeholders — the LLM wrote what KIND of info goes
 * here, instead of the info itself. Each pattern matches WHOLE values only
 * (^…$) — a real phone number that coincidentally contains the word
 * "number" must NOT be caught. Scoped per field so a complaint that
 * legitimately mentions "serial" (in context) never gets stripped.
 *
 * These are the ONLY "hard drop" rules; format regex (digit counts, email
 * shape, letter/digit mix) never blocks — it only cleans.
 */
const PLACEHOLDER_PATTERNS: Readonly<Record<string, readonly RegExp[]>> = {
  contactNumber: [
    /^(?:the )?(?:customer(?:'s|s)? )?(?:phone|contact|telephone|cell|mobile|best)?\s*(?:number|no\.?|#)?(?: is)?\.?$/i,
    /^(?:call|reach|text|contact)\s+(?:me|us|them|you|him|her)(?:\s+(?:at|on|back))?\.?$/i,
    /^(?:provided )?over (?:the )?phone$/i,
    /^not (?:provided|given|on file|available)(?: yet)?\.?$/i,
  ],
  emailAddress: [
    /^(?:the )?(?:customer(?:'s|s)? )?(?:e-?mail|e-?mail address)(?: is)?\.?$/i,
    /^(?:contacted|reached)(?: them)? (?:by|via|over) (?:phone|call|message)\.?$/i,
    /^no (?:e-?mail|address)(?: (?:on file|provided|available))?\.?$/i,
    /^not (?:provided|given|on file|available)(?: yet)?\.?$/i,
  ],
  skuNumber: [
    /^(?:the )?(?:sku|part)(?: number| code| no\.?)?(?: is)?\.?$/i,
    /^not (?:provided|given|on file|available)(?: yet)?\.?$/i,
  ],
  serialNumber: [
    /^(?:the )?(?:serial|s\s*\/\s*n)(?: number| no\.?)?(?: is)?\.?$/i,
    /^not (?:provided|given|on file|available)(?: yet)?\.?$/i,
  ],
};

/** True when `value` is a pure category-label placeholder (no content) for
 *  the given field. These are the only values still hard-dropped; format
 *  mismatches are kept so the agent can proofread them. */
function isPlaceholderFor(fieldId: string, value: string): boolean {
  const patterns = PLACEHOLDER_PATTERNS[fieldId];
  if (!patterns) return false;
  const trimmed = value.trim();
  return patterns.some((re) => re.test(trimmed));
}

/** Normalize a phone number read out digit-by-digit-ish ("two one two five…")
 *
 *  LLM-first: spoken word-digits are converted FIRST, then formatting runs on
 *  whatever digit content came out (US 10-digit → (xxx) xxx-xxxx). Anything
 *  that doesn't perfectly format (international, extensions, partial reads)
 *  returns the cleaned conversion — with real digits where the LLM read
 *  words — instead of being dropped. */
function sanitizePhone(value: string): string {
  const converted = wordsToDigits(value);
  const digits = converted.replace(/[^\d]/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return converted.replace(/\s+/g, ' ').trim();
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
 * LLM-FIRST RULE: the model's output is always accepted as the primary
 * reading. Format-shape regexes CLEAN values when they can (spoken-word
 * numbers → digits, channel canonicalization, keyword classification, etc.)
 * but MUST NOT silently drop a field because it didn't match a pattern. The
 * only hard drops are:
 *
 *  - isBlank() — explicit "n/a / unknown / none" placeholders;
 *  - isPlaceholderFor() — pure category labels ("the phone number", "no
 *    email provided") where the LLM named the FIELD instead of the VALUE;
 *  - tiny content (< 2 chars) for name/model fields (pure noise);
 *  - unknown field ids.
 *
 * Model names canonicalize; issue types use keyword-classifier as a
 * polish fallback but keep free-text otherwise; emails/phones are cleaned.
 * Values are then length-capped (cap is generous — the UI shows overflow
 * ellipsis visually so nothing meaningful is cut).
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
    const rawBeforeClean = cleaned; // used by placeholder checks against the unmolested value

    switch (fieldId) {
      case 'deebotModel': {
        // Canonicalize onto the fleet list when the model's naming maps
        // to it ("O1000 RTK" → GOAT O1000 RTK, ASR zero/O confusion
        // included). When it does NOT map, keep the model's own naming as
        // is: a free-text model (glow-marked for verification) beats an
        // empty field. Only obvious pure noise (< 2 chars) is dropped —
        // all real model identifiers have letter+digit pairs (≥ 2).
        if (cleaned.length < 2) continue;
        cleaned = matchCanonicalModel(cleaned) ?? cleaned;
        break;
      }
      case 'contactNumber': {
        // LLM-first: wordsToDigits FIRST converts spoken words → digits
        // (the number the model actually read), then US 10-digit format
        // applies on top if it fits. FORMAT REGEX IS NOT A GATE. If the
        // cleaned value is a pure CATEGORY LABEL placeholder ("number",
        // "customer's phone", "not provided"), drop it — otherwise keep
        // whatever the LLM produced (partial, international, extension…)
        // so the agent can proofread it. A value they can correct beats a
        // value silently erased.
        cleaned = sanitizePhone(cleaned);
        const digitCount = cleaned.replace(/\D/g, '').length;
        if (digitCount < 7 && isPlaceholderFor('contactNumber', rawBeforeClean)) continue;
        break;
      }
      case 'emailAddress': {
        // Sanitize spoken ("john at gmail dot com") → john@gmail.com.
        // Regex SHAPE is NOT a hard gate: if the result fits the pattern,
        // great; if not, only drop it when it's a pure no-content
        // placeholder ("no email", "contacted by phone", "the customer's
        // email address"). Anything else — odd TLDs, odd formatting — is
        // kept so the agent can proofread, not silently lose.
        const beforeEmail = cleaned;
        cleaned = sanitizeEmail(cleaned);
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) &&
          isPlaceholderFor('emailAddress', beforeEmail)
        ) continue;
        break;
      }
      case 'purchaseInfo': {
        // Shape the model's purchase answer the same way the regex
        // backstop does: canonicalize the channel spelling ("bestbuy",
        // "the ecovacs website") onto the clean retailer name and format
        // it as "Channel · when". Values naming no known channel ("a
        // local vacuum shop · 2024") pass through untouched.
        if (canonicalPurchaseChannel(cleaned)) {
          cleaned = formatPurchaseValue(cleaned);
        }
        break;
      }
      case 'skuNumber':
      case 'serialNumber': {
        // LLM-FIRST: the "must contain a digit" regex gate is REMOVED.
        // Uncommon-but-real alphanumeric identifiers (DEEBOT-X2-ACC,
        // "ALPHA BRAVO CHARLIE" read back as words) must reach the form
        // for the agent to verify. Only pure CATEGORY placeholders are
        // dropped: "serial", "sku number", "not provided" — labels with
        // zero payload content from the LLM.
        const placeholderKey = fieldId as 'skuNumber' | 'serialNumber';
        if (isPlaceholderFor(placeholderKey, cleaned)) continue;
        break;
      }
      case 'issueType': {
        // Fuzzy-match against the canonical options; when the LLM
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
