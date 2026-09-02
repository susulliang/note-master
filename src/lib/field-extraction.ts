/**
 * Speaker-aware field extraction — pure logic shared by the Web Speech hook,
 * the call-capture hook and the LLM parser worker.
 *
 * This module deliberately has NO React and NO browser globals so it can be
 * bundled into workers. It maps a speaker-tagged transcript (Agent = the
 * Ecovacs rep on the mic, Customer = the CCP tab audio) onto ticket fields:
 *
 *  - customer-first-person phrasings ("my name is…") only parse from the
 *    CUSTOMER's speech, so the agent's "My name is Jake, how can I help?"
 *    greeting never lands in Customer Name;
 *  - agent dictation/confirmation phrasings ("customer's number is…") only
 *    parse from the AGENT's speech;
 *  - model names parse from either speaker (the agent asks "which model?",
 *    the customer confirms "the N20 Pro") and are canonicalized against the
 *    exact combobox option list;
 *  - the customer's complaint clauses and the agent's TBS steps accumulate
 *    across the whole call;
 *  - issue type classifies from keywords into the canonical
 *    "Category::Item" combobox values, condensing a short free-text label
 *    only when nothing canonical matches.
 */

import { DEEBOT_MODELS, ISSUE_TYPES } from '@/data/ticket';

// ---------------------------------------------------------------------------
//  Transcript types
// ---------------------------------------------------------------------------

/** Who said something: the agent (mic) or the customer (CCP tab audio) */
export type Speaker = 'agent' | 'customer';

/** One transcribed utterance, tagged with who said it. */
export interface TranscriptEntry {
  speaker: Speaker;
  text: string;
}

// ---------------------------------------------------------------------------
//  Extracted-field types
// ---------------------------------------------------------------------------

export interface ExtractedField {
  fieldId: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Which engine produced an auto-fill, and therefore how the form may merge
 * it into the field's current text:
 *
 *  - 'regex'      — provisional pattern match; only ever fills an EMPTY
 *                   field, never disturbs anything already written;
 *  - 'regex-grow' — the ACCUMULATING regex fields (issue clauses, TBS
 *                   steps) re-extracted longer after more speech arrived;
 *                   replaces the value a previous regex/paraphrase pass
 *                   wrote, but never human-typed or LLM-authored text;
 *  - 'paraphrase' — the LLM polishing stage: the verbatim vernacular
 *                   clauses the regex engine collected, rewritten into
 *                   concise note style. Same replace rules as
 *                   'regex-grow' (it derives from the same text);
 *  - 'llm'        — the PRIMARY parser's full-context reading of the
 *                   conversation; authoritative over everything except
 *                   human-typed text (which it appends to).
 */
export type AutoFillSource = 'regex' | 'regex-grow' | 'paraphrase' | 'llm' | 'dom-ext';

/**
 * Which speech a field may be parsed from. The agent works FOR Ecovacs and
 * the customer is calling in, so:
 *
 *  - `customer` — first-person phrasing ("my name is…", "my number is…").
 *    Running these against agent speech would parse the AGENT's own name
 *    into the Customer Name field ("My name is Jake, how can I help you?").
 *  - `agent` — dictation phrasing, the agent repeating/confirming what the
 *    customer said ("customer's name is…", "their number is…").
 *  - `any` — speaker-independent phrasing (model names, issue clauses):
 *    the agent may elicit ("which model do you have?") and the customer
 *    confirms ("the N20 Pro"), or the customer just states it.
 */
export interface FieldPatternEntry {
  fieldId: string;
  label: string;
  /** Regexes run against the CUSTOMER's speech only (first-person phrasing) */
  customer?: RegExp[];
  /** Regexes run against the AGENT's speech only (dictation phrasing) */
  agent?: RegExp[];
  /** Regexes run against either speaker's speech */
  any?: RegExp[];
  /** Collect every match (issue clauses, TBS steps) instead of first-wins */
  accumulate?: boolean;
  /** Joiner between accumulated matches (defaults to '; ') */
  join?: string;
}

// ---------------------------------------------------------------------------
//  Issue-type keyword classification — spoken phrasing → "Category::Item"
//  (the exact strings the Issue Type combobox stores). Most specific first.
// ---------------------------------------------------------------------------

const ISSUE_TYPE_KEYWORDS: ReadonlyArray<{ pattern: RegExp; value: string }> = [
  // --- Charging / power ---
  {
    pattern: /\b(?:won'?t|not|can'?t|cannot|doesn'?t|fail(?:s|ed)? to|unable to|no longer)\s+charg/i,
    value: 'Failure::Unable to charge/fully charge',
  },
  { pattern: /\b(?:charging|charger|charge) (?:issue|problem|error|fail|fault)/i, value: 'Failure::Unable to charge/fully charge' },
  { pattern: /\bnot (?:fully )?charg(?:ed|ing)\b/i, value: 'Failure::Unable to charge/fully charge' },
  { pattern: /\b(?:won'?t|can'?t|cannot)\s+(?:turn on|power on|come on|start|boot)/i, value: 'Failure::Unable to power on the robot' },
  { pattern: /\b(?:no|zero)\s+power\b|\b(?:is\s+)?(?:completely\s+)?dead\b/i, value: 'Failure::Unable to power on the robot' },
  { pattern: /\b(?:powers?|shuts?|turns?)\s+(?:itself\s+)?off\b.{0,35}\b(?:by itself|randomly|mid[- ]?clean|during cleaning|while clean)/i, value: 'Failure::Robot suddenly powers off by itself' },
  { pattern: /\b(?:shuts?|turns?|powers?) (?:itself )?off (?:by itself|on (?:its|her|his) own|randomly)\b/i, value: 'Failure::Robot suddenly powers off by itself' },
  { pattern: /\b(?:automatically )?shut(?:s|ting)? (?:itself )?down\b/i, value: 'Failure::Automatic shutdown' },
  { pattern: /\b(?:won'?t|doesn'?t|not)\s+(?:go|return(?:ing)?|dock|go back)\s+(?:back )?to (?:the |my )?(?:base|station|dock|charger|charging|home|charging station)/i, value: 'Failure::Unable to return to station' },
  { pattern: /\bcan'?t (?:find|see|reach) (?:the |its |his |her )?(?:base|station|dock|charger|home)\b/i, value: 'Failure::Unable to return to station' },
  { pattern: /\bbattery (?:drains?|drain(?:ed|ing)?|runs?|run(?:ning)? out|dies?|dy(?:i)?ng)\b/i, value: 'Failure::Short operating time' },
  { pattern: /\bbattery (?:is |wears?|worn|degrad|bad|no good|failing)\b/i, value: 'Product experience::Short battery runtime' },
  { pattern: /\b(?:charge|charging) (?:light|led|indicator) .{0,25}\b(?:not|no|never)\b/i, value: 'Failure::Charging status not displayed' },

  // --- Movement / navigation ---
  { pattern: /\b(?:go(?:es|ing)|spins?|turn(?:s|ing)|mov(?:es|ing)|driv(?:es|ing)) in circles\b/i, value: 'Failure::Robot spins in circles or moves backward' },
  { pattern: /\b(?:keeps?|is) (?:going|moving|driving) (?:backwards|backward)\b/i, value: 'Failure::Robot spins in circles or moves backward' },
  { pattern: /\b(?:keep(?:s|ing)|get(?:s|ting)?) stuck\b|\bis stuck\b/i, value: 'Failure::Fails to escape when stuck' },
  { pattern: /\bstuck (?:on|under|in|behind|between)\b/i, value: 'Failure::Fails to escape when stuck' },
  { pattern: /\b(?:won'?t|doesn'?t|not)\s+(?:move|moving|go|going|drive)\b/i, value: 'Failure::Not working after powered on/Deebot light blinking but can not work' },
  { pattern: /\b(?:bump(?:er)?|bumper) (?:stuck|jammed|error|fault)/i, value: 'Failure::Bumper stuck' },
  { pattern: /\b(?:keeps? |keeps on )?(?:bump|crash|hitt)(?:ing|s)\b.{0,30}\b(?:furniture|walls?|everything|things?)\b/i, value: 'Product experience::Frequent collisions' },
  { pattern: /\b(?:doesn'?t|not|won'?t)\s+(?:avoid|detect|see)\s+(?:obstacles?|things?|objects?)\b/i, value: 'Failure::Robot not avoiding obstacles' },
  { pattern: /\b(?:miss(?:es|ed|ing)|not clean(?:ing)?)\s+(?:spots?|areas?|corners?|edges?)\b/i, value: 'Failure::Missed cleaning in areas' },

  // --- Mowing (GOAT lawn mowers) ---
  { pattern: /\b(?:cannot|can'?t|won'?t|doesn'?t|not|fails? to|failed to|unable to)\s+mow\b/i, value: 'Failure::Unable to mow' },
  { pattern: /\bleft (?:some |several |numerous |many )?(?:areas?|patches?|spots?|sections?|grass)\s+(?:un-?)?cut\b|\b(?:uncut|un-?cut|missed)\s+(?:areas?|patches?|spots?)\b/i, value: 'Product experience::Missed mowing' },
  { pattern: /\bmow(?:s|ing|ed)?\b.{0,35}\b(?:edges?|corners?)\b.{0,35}\b(?:not|can'?t|miss|un-?cut|unable|poor)\b/i, value: 'Product experience::Unable to mow edges/corners' },
  // Mower owners rarely say "mow": "I couldn't ever get to the edges",
  // "it wouldn't do the edges" — the negation + edge noun is the giveaway
  { pattern: /\b(?:couldn'?t|can'?t|won'?t|wouldn'?t|doesn'?t|didn'?t|not|never)\s+(?:ever\s+)?(?:get to|reach|do|cut|trim|handle)\s+(?:the\s+|any\s+|my\s+)?edges\b/i, value: 'Product experience::Unable to mow edges/corners' },
  // "goes down and back three or four times and stops" / "all of a sudden
  // it just stops" — unit dies mid-job, on a mower that is failed mowing
  { pattern: /\b(?:go(?:es|ing)?|went|mow(?:s|ing|ed)?|run(?:s|ning)?)\b.{0,40}\band stop|\bstops?\s+(?:after|mid|in the middle of|during|partway)\b/i, value: 'Failure::Unable to mow' },
  { pattern: /\bpoor mow(?:ing|s)?\b|\b(?:mow(?:ing)?)? performan(?:ce|t).{0,20}mow/i, value: 'Product experience::Poor mowing performance' },
  { pattern: /\b(?:doesn'?t|not)\s+(?:clean|vacuum|sweep|mop)\s+(?:at all|anything|the floor|the carpet)\b/i, value: 'Failure::Fail to vacuum' },
  { pattern: /\b(?:runs?|drives?) (?:over|through) (?:pet|dog|cat)\b.{0,25}\b(?:feces|poop|pee)\b/i, value: 'Failure::Damaged by pet/animal feces' },
  { pattern: /\b(?:random|erratic|wrong|weird|crazy)\s+(?:route|path|pattern)\b/i, value: 'Failure::Repeated cleaning/chaotic route' },
  { pattern: /\brepeat(?:s|ing|ed)\b.{0,30}\b(?:same (?:area|spot|place)|over and over|again and again)\b/i, value: 'Failure::Repeated cleaning/chaotic route' },

  // --- Noise / mechanical ---
  { pattern: /\b(?:making|makes|made)\s+(?:a\s+)?(?:loud|weird|strange|funny|grinding|squeaking|clicking|abnormal)\s+(?:noise|sound|noises|sounds)\b/i, value: 'Failure::Robot making abnormal sound/noise' },
  { pattern: /\b(?:very |really )?noisy\b|\b(?:grind|squeak|click|rattle)(?:ing|s)?\s+(?:sound|noise)s?\b/i, value: 'Failure::Robot making abnormal sound/noise' },
  { pattern: /\bmain brush\b.{0,30}\b(?:tangled|wrapped|stuck|stop(?:s|ped)?|jammed|not (?:spinning|turning))\b/i, value: 'Failure::Main brush entangled / Main brush malfunction' },
  { pattern: /\bside brush\b.{0,30}\b(?:tangled|wrapped|stuck|stop(?:s|ped)?|jammed|not (?:spinning|turning)|fall(?:s|ing)? off|detached)\b/i, value: 'Failure::Side brush tangled or stuck' },
  { pattern: /\b(?:wheel|wheels)\b.{0,30}\b(?:stuck|jammed|not (?:spinning|turning)|fall(?:s|ing)? off|loose|wobbl)/i, value: 'Failure::Drive wheel alarm/Stuck with foreign object' },
  { pattern: /\b(?:overheat|hot to touch|burning smell|burnt smell|smells? (?:like )?burn)\b/i, value: 'Failure::Robot overheating and unusual odor' },

  // --- Water / mopping / station ---
  { pattern: /\b(?:leak(?:s|ing|ed)?|drip(?:s|ping|ped)?)\s+water\b|\bwater (?:on|all over) (?:the |my )?floor\b/i, value: 'Failure::Deebot dripping water / Water leakage' },
  { pattern: /\bwater tank\b.{0,40}\b(?:not|no|won'?t|doesn'?t)\b.{0,25}\b(?:spray|dispens|come out|work)/i, value: 'Failure::Deebot water tank not dispensing / Water seeping slowly' },
  { pattern: /\b(?:mop|mopping) (?:pad|pads)\b.{0,35}\b(?:not|won'?t|doesn'?t)\b.{0,20}\b(?:spin|rotat|turn)/i, value: 'Failure::Cleaning pad not rotating/rotating intermittently' },
  { pattern: /\b(?:not|no|won'?t)\s+mop(?:ping)?\b/i, value: 'Failure::Fail to vacuum' },
  { pattern: /\bcarpets?\b.{0,25}\b(?:wet|soaked|damp|water)\b/i, value: 'Product experience::Carpets get wet during mopping' },
  { pattern: /\bstreaks?\b.{0,20}\b(?:on|after)\b.{0,15}\b(?:floor|mopping|glass)\b/i, value: 'Product experience::Too many water streaks after mopping' },
  { pattern: /\b(?:cleaning sink|station)\b.{0,30}\b(?:full|alarm|error|malfunction|not work)/i, value: 'Failure::Cleaning sink is malfunction or full alarm' },
  { pattern: /\b(?:auto[- ]?empty|dust bag)\b.{0,30}\b(?:not|won'?t|error|fail|alarm|malfunction|full)\b/i, value: 'Failure::Auto-empty malfunction' },
  { pattern: /\bdust bag (?:full|alarm|error)\b/i, value: 'Failure::Dust bag alarm' },
  { pattern: /\bdirty water tank\b.{0,30}\b(?:not installed|full|error|alarm|malfunction)\b/i, value: 'Failure::Robot prompts dirty water tank is not installed' },

  // --- Network / app / maps ---
  { pattern: /\bwifi\b.{0,40}\b(?:not|can'?t|won'?t|doesn'?t|fail|failed)\b/i, value: 'Failure::Network setup failed' },
  { pattern: /\b(?:can'?t|cannot|won'?t|unable to|trouble|problems?|failed to)\s+(?:connect|link|pair|set ?up)\b.{0,30}\b(?:wifi|wi[- ]?fi|internet|network|router|app)\b/i, value: 'Failure::Network setup failed' },
  { pattern: /\b(?:setup|set up|setting up)\b.{0,25}\b(?:network|wifi|wi[- ]?fi|connection)\b.{0,25}\b(?:fail|error|not work)\b/i, value: 'Failure::Network setup failed' },
  { pattern: /\b(?:app|application)\b.{0,30}\b(?:crash|freez|won'?t open|not open|not load|error|not work)/i, value: 'Failure::App crashing' },
  { pattern: /\b(?:app|application)\b.{0,30}\b(?:can'?t|won'?t|doesn'?t|not)\b.{0,20}\b(?:connect|find|see|pair|detect|link)\b.{0,25}\b(?:robot|deebot|device|machine)/i, value: 'How to use::App connection' },
  { pattern: /\b(?:offline|off line)\b/i, value: 'Failure::Device offline after network setup' },
  { pattern: /\b(?:lost|deleted|gone|reset)\b.{0,20}\b(?:the |my |all )?maps?\b|\bmaps?\b.{0,20}\b(?:lost|gone|deleted|missing|wrong|different)\b/i, value: 'Failure::Lost map' },
  { pattern: /\b(?:wrong|different|doesn'?t match|not match)\b.{0,25}\b(?:house|home|layout|actual)\b/i, value: 'Failure::2D/3D house map not matching actual layout' },
  { pattern: /\b(?:map|mapping)\b.{0,25}\b(?:fail|error|distort|skew|overlap)\b/i, value: 'Failure::Map learning failed' },
  { pattern: /\bnot respond(?:ing|s)?\b.{0,30}\b(?:command|voice|yiko|app)\b/i, value: 'Failure::YIKO cannot be woken / No response / Command not executed' },
  { pattern: /\b(?:yiko|voice assistant|voice control)\b.{0,30}\b(?:not|can'?t|won'?t|doesn'?t)\b.{0,25}\b(?:respond|work|wake|hear|listen)/i, value: 'Failure::YIKO cannot be woken / No response / Command not executed' },
  { pattern: /\b(?:slow|delay|delayed|no)\s+(?:response|reply|react)\b/i, value: 'Failure::Robot Delayed or no response after command input' },

  // --- Error codes ---
  { pattern: /\berror (?:code )?e?\d{3,4}\b|\bshows? (?:an )?error\b|\berror (?:on|in) (?:the )?(?:screen|app|display)\b/i, value: 'Failure::Error code' },

  // --- Suction ---
  { pattern: /\b(?:no|weak|poor|low|bad)\s+(?:suction|pick ?up|cleaning power|vacuum power)\b/i, value: 'Product experience::Low suction power' },
  { pattern: /\bdoesn'?t pick up\b.{0,25}\b(?:dirt|dust|debris|crumbs|hair|anything)\b/i, value: 'Product experience::Low suction power' },

  // --- Parts / damage / missing ---
  { pattern: /\b(?:broken|cracked|damaged|snapped?|shattered)\b.{0,30}\b(?:part|piece|cover|lid|wheel|brush|tank|clip|button|cord|cable)\b/i, value: 'Damaged parts::Damaged power cord' },
  { pattern: /\b(?:missing|not in (?:the )?box|didn'?t (?:come|arrive) with|no)\b.{0,30}\b(?:part|accessor|manual|remote|adapter|cord|dock|brush|filter|tank|mop)\b/i, value: 'Missing parts::Side brush missing' },
  { pattern: /\b(?:didn'?t|not) receive\b.{0,30}\b(?:part|accessor|gift|item|dock|station)\b/i, value: 'Missing parts::Side brush missing' },

  // --- Parts / accessory ordering — a REQUEST is a valid reason for the
  // call: "is there a way that I could get that part ordered?", "I need
  // to buy a replacement dust box", "how can I order a spare filter" ---
  {
    pattern: /\b(?:get|order|ordering|buy|buying|purchase|need|replace)\b[^.!?]{0,40}\b(?:part|accessor(?:y|ies)?|dust ?box|dustbin|spare|filter|side brush|main brush|mop pad|battery|remote|dock|station|cord|adapter|bag)\b/i,
    value: 'Aftersale-Service inquiry::Accessory Purchase',
  },
  {
    pattern: /\b(?:part|accessor(?:y|ies)?|dust ?box|dustbin|spare|filter|side brush|main brush|mop pad|battery|remote|dock|station|cord|adapter|bag)\b[^.!?]{0,40}\b(?:order(?:ed|ing)?|purchase|buy)\b/i,
    value: 'Aftersale-Service inquiry::Accessory Purchase',
  },
  {
    pattern: /\bhow (?:do|can|could) i (?:order|buy|get|purchase)\b[^.!?]{0,30}\b(?:part|accessor|spare|replacement|dust ?box|filter|brush)\b/i,
    value: 'Aftersale-Service inquiry::Accessory Purchase',
  },
  { pattern: /\b(?:misplaced|lost|went missing)\b.{0,25}\b(?:part|accessor|dust ?box|bin|filter|brush|remote|piece)\b/i, value: 'Aftersale-Service inquiry::Accessory Purchase' },

  // --- Purchase / returns / refunds ---
  { pattern: /\bwant (?:to |a )?(?:refund|my money back)\b|\brequest(?:ing)? (?:a )?refund\b|\bask(?:ing)? for (?:a )?refund\b/i, value: 'Return Request::Return and exchange application' },
  { pattern: /\breturn(?:ing)? (?:it|the (?:robot|deebot|machine|item))\b|\bwant to send (?:it|this) back\b/i, value: 'Return Request::Return and exchange application' },
  { pattern: /\b(?:status of|where'?s) (?:my )?refund\b/i, value: 'Aftersale-Service inquiry::Refund status' },
  { pattern: /\bwant(?:s|ing)? (?:a |an )?(?:replacement|new one|new machine|exchange)\b|\breplac(?:e|ing) (?:it|the (?:robot|machine|unit))\b/i, value: 'Aftersale-Service inquiry::Repair request' },
  { pattern: /\bwarranty\b/i, value: 'Aftersale-Service inquiry::Warranty Policy' },
  { pattern: /\b(?:never|not) (?:received|got|got(?:ten)?) (?:my )?(?:the )?(?:order|package|delivery|parcel|item|gift)\b/i, value: 'Shipping issues::Delayed shipment' },
  { pattern: /\bwhere'?s (?:my )?(?:order|package|delivery|parcel)\b|\btrack(?:ing)? (?:my )?order\b/i, value: 'Shipping issues::Urge Delivery' },

  // --- How-to / general usage ---
  { pattern: /\bhow (?:do|can|to) (?:i|you)\b.{0,40}\b(?:app|connect|wifi|pair|setup|set up|schedule|map|reset|clean|install|use)\b/i, value: 'How to use::App connection' },
  { pattern: /\b(?:don'?t|do not) know how (?:to|if)\b/i, value: 'How to use::New machines' },
  { pattern: /\b(?:first time|new (?:owner|user|machine)|just (?:bought|got|purchased))\b/i, value: 'How to use::New machines' },
  { pattern: /\bhow (?:long|much time)\b.{0,25}\b(?:charge|charging|battery)\b/i, value: 'How to use::Charging instruction' },
  { pattern: /\b(?:set|change|cancel) (?:up )?(?:a )?schedul/i, value: 'How to use::Scheduling' },
  { pattern: /\bschedule(?:d)? (?:clean|cleaning|time)\b/i, value: 'How to use::Scheduling' },
];

/** The agent asking what's wrong — the customer's NEXT utterance is the complaint. */
const AGENT_ISSUE_QUESTION =
  /(?:what(?:'?s| is| seems to be) (?:the |going on|happening|the matter)|what can i do for you|how can i help|how may i help|tell me (?:what|about|more)|what'?s (?:wrong|the problem|the issue|the trouble|bothering)|describe (?:the|your) (?:issue|problem)|how'?s (?:it|the (?:robot|machine)) (?:doing|going)|what'?s it doing|can i know (?:the |your )?(?:original )?(?:problem|issue)|what was (?:the|that) (?:problem|issue))/i;

// ---------------------------------------------------------------------------
//  Model canonicalization — spoken model token → exact combobox option
// ---------------------------------------------------------------------------

function normalizeModelKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9+]/g, '');
}

/**
 * ASR cannot tell the letter O from the digit 0 inside model numbers: "O1000
 * LiDAR PRO" comes back as "01000 LIDAR Pro". Mapping 0→o on BOTH sides
 * (option and spoken token) makes the spellings comparable — "01000" →
 * "o1ooo" equals "O1000" → "o1ooo" — without breaking pure-digit models
 * (T30 → "t3o" on both sides, so those comparisons stay consistent).
 */
function normalizeModelKeyZeroAsO(raw: string): string {
  return normalizeModelKey(raw).replace(/0/g, 'o');
}

/**
 * Whisper emits bracketed pseudo-tags like "[BLANK_AUDIO]", "[INAUDIBLE]"
 * or "[ Inaudible ]" for non-speech audio (silence, noise, music). They
 * carry no ticket information but pollute the transcript, the pattern
 * extraction and especially the LLM prompt — strip them, and drop turns
 * that become empty.
 *
 * Brackets are REQUIRED: bare words like "music" or "noise" occur in real
 * speech ("it makes a noise while charging") and must survive.
 */
const ASR_ARTIFACT_TAG =
  /\[\s*(?:inaudible|blank[_ ]?audio|silence|noise|music(?:\s+playing)?|applause|laughter|crosstalk|unintelligible|no speech|pause)\s*\]/gi;

/** Remove ASR artifact tags from a transcript turn */
export function stripAsrArtifacts(text: string): string {
  return text.replace(ASR_ARTIFACT_TAG, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** True when a turn is ONLY ASR artifacts (no actual speech in it) */
export function isAsrArtifact(text: string): boolean {
  return stripAsrArtifacts(text).length === 0;
}

export function matchCanonicalModel(raw: string): string | null {
  const key = normalizeModelKey(raw);
  if (!key || key.length < 2) return null;

  // Exact match first
  for (const option of DEEBOT_MODELS) {
    if (normalizeModelKey(option) === key) return option;
  }
  // Prefix match — "x2 omni" should become X2 OMNI, not X2 OMNI White
  let best: string | null = null;
  for (const option of DEEBOT_MODELS) {
    const optKey = normalizeModelKey(option);
    // Suffix match — the GOAT lawn mowers are usually spoken WITHOUT their
    // brand ("you have a O1000 RTK"), and the canonical options all carry
    // the "GOAT " prefix; without this the token fails to canonicalize (or
    // gets rejected outright on the LLM path) and the model field is lost.
    if (
      key.length >= 3 && optKey.startsWith(key) ||
      (key.length >= 4 && optKey.endsWith(key))
    ) {
      if (!best || normalizeModelKey(best).length > optKey.length) best = option;
    }
  }
  if (best) return best;

  // O↔0-insensitive pass — same prefix/suffix rules, but comparing the
  // zero-as-O renderings of both sides, so ASR's "01000 LIDAR Pro" meets
  // the canonical "O1000 LiDAR PRO" instead of missing it.
  const okey = normalizeModelKeyZeroAsO(raw);
  for (const option of DEEBOT_MODELS) {
    const optKey = normalizeModelKeyZeroAsO(option);
    if (
      okey.length >= 3 && optKey.startsWith(okey) ||
      (okey.length >= 4 && optKey.endsWith(okey))
    ) {
      if (!best || normalizeModelKeyZeroAsO(best).length > optKey.length) best = option;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
//  Issue-type helpers
// ---------------------------------------------------------------------------

/**
 * Run the issue-type keyword table over any text (transcript or an LLM's
 * free-text summary) and return the first matching `Category::Item`.
 */
export function classifyIssueType(text: string): string | null {
  if (!text) return null;
  for (const { pattern, value } of ISSUE_TYPE_KEYWORDS) {
    if (pattern.test(text)) return value;
  }
  return null;
}

/** Fuzzy-match a raw phrase against the canonical Issue Type option list. */
export function canonicalIssueType(raw: string): string | null {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;

  for (const option of ISSUE_TYPES) {
    if (option.toLowerCase().replace(/[^a-z0-9]/g, '') === key) return option;
  }
  let best: string | null = null;
  for (const option of ISSUE_TYPES) {
    const optKey = option.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key.length >= 4 && optKey.includes(key)) {
      if (!best || optKey.length < best.toLowerCase().replace(/[^a-z0-9]/g, '').length) {
        best = option;
      }
    }
  }
  return best;
}

/** Words dropped when condensing a complaint into a short issue-type phrase */
const ISSUE_TYPE_STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'it', 'its', "it's", 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or',
  'but', 'so', 'that', 'this', 'these', 'those', 'i', "i'm", 'im', 'me', 'we',
  'you', 'he', 'she', 'they', 'robot', 'deebot', 'vacuum', 'machine', 'again',
  'anymore', 'just', 'keeps', 'keep', 'very', 'really', 'quite', 'about',
  'from', 'will', 'would', 'could', 'should', 'does', 'do', 'did', 'have',
  'has', 'had', 'when', 'then', 'there', 'here', 'now', 'still', 'also',
]);

/**
 * Condense a complaint into a short free-text issue type when no canonical
 * option matches ("the robot won't charge anymore" → "Won't charge").
 * Preserves negations and verbs — they carry the meaning.
 */
export function summarizeIssueType(description: string): string | null {
  const cleaned = description
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return null;

  const kept = cleaned.filter((w) => !ISSUE_TYPE_STOPWORDS.has(w.toLowerCase()));
  if (kept.length === 0) return null;

  const phrase = kept.slice(0, 6).join(' ').replace(/^[-\s]+/, '');
  if (!phrase) return null;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// ---------------------------------------------------------------------------
//  Field patterns (speaker-aware)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
//  Purchase channel canonicalization — spoken/casual channel → clean name
// ---------------------------------------------------------------------------

/**
 * Common purchase channels: the retailer as speakers say it (with ASR
 * spellings — "bestbuy", "wal-mart", "the ecovacs website") mapped onto
 * the clean name that belongs on the ticket. The purchase box is free
 * text with quick buttons (Amazon / Ecovacs / US / CA / Other Retailers),
 * so the canonical name just needs to be readable, not list-exact.
 *
 * Official-store phrasings come FIRST: "your website", "directly from
 * you", "ecovacs.com" must beat the generic retailer entries.
 */
const PURCHASE_CHANNELS: ReadonlyArray<{ pattern: RegExp; value: string }> = [
  {
    pattern: /\becovacs(?:\.com|'?s)?\b|\bofficial (?:store|site|website)\b|\byour (?:website|store|site|online store)\b|\bfrom you(?:rself| guys| directly)?\b|\bmanufacturer'?s? (?:website|store|site)\b|\bdirect(?:ly)? from (?:the )?(?:manufacturer|company|brand)\b/i,
    value: 'Ecovacs official store',
  },
  { pattern: /\bbest ?buy\b/i, value: 'Best Buy' },
  { pattern: /\be[ -]?bay\b/i, value: 'eBay' },
  { pattern: /\bamazon\b/i, value: 'Amazon' },
  { pattern: /\btarget\b/i, value: 'Target' },
  { pattern: /\bwal-?mart\b/i, value: 'Walmart' },
  { pattern: /\bcostco\b/i, value: 'Costco' },
  { pattern: /\bsam'?s ?club\b/i, value: "Sam's Club" },
  { pattern: /\bhome ?depot\b/i, value: 'Home Depot' },
  { pattern: /\blowe'?s\b/i, value: "Lowe's" },
  { pattern: /\bfred ?meyer\b/i, value: 'Fred Meyer' },
  { pattern: /\bkohl'?s\b/i, value: "Kohl's" },
  { pattern: /\bmacy'?s\b/i, value: "Macy's" },
  { pattern: /\bbj'?s\b/i, value: "BJ's" },
  { pattern: /\bnewegg\b/i, value: 'Newegg' },
  { pattern: /\bwayfair\b/i, value: 'Wayfair' },
  { pattern: /\bbed bath (?:and|&|n) beyond\b/i, value: 'Bed Bath & Beyond' },
  { pattern: /\bmicro ?center\b/i, value: 'Micro Center' },
  { pattern: /\baliexpress\b/i, value: 'AliExpress' },
  { pattern: /\brakuten\b/i, value: 'Rakuten' },
  { pattern: /\btemu\b/i, value: 'Temu' },
  { pattern: /\bqvc\b|\bhsn\b/i, value: 'QVC/HSN' },
  { pattern: /\bwish\b/i, value: 'Wish' },
];

/** The channel a purchase mention names, or null when it names none */
export function canonicalPurchaseChannel(raw: string): string | null {
  for (const entry of PURCHASE_CHANNELS) {
    if (entry.pattern.test(raw)) return entry.value;
  }
  return null;
}

/**
 * Time-ish vocabulary for the "when" half of a purchase value. Captures run
 * to a sentence terminator — but turns are CONCATENATED, so a capture can
 * bleed into the next turn ("Amazon one year ago My dog chewed the cable").
 * Keeping only time words turns that back into "one year ago".
 */
const WHEN_WORDS = new Set([
  'about', 'around', 'almost', 'nearly', 'just', 'over', 'under', 'past',
  'a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'couple', 'few', 'several',
  'half', 'and', 'or', 'to', 'last', 'this', 'in', 'the', 'of',
  'year', 'years', 'yr', 'yrs', 'month', 'months', 'week', 'weeks',
  'day', 'days', 'ago', 'back', 'spring', 'summer', 'fall', 'autumn',
  'winter', 'christmas', 'black', 'friday', 'new', 'recently', 'now',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
]);

/**
 * Grammatical glue trimmed from the ENDS of the "when" half. Kept separate
 * from WHEN_WORDS because "about/around/last" carry meaning INSIDE the
 * phrase ("about two years ago") but are junk at the edges ("one year ago
 * the" — cross-turn bleed).
 */
const WHEN_GLUE = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or']);

/**
 * Shape a captured purchase mention into "Channel · when": canonicalize
 * the channel spelling, then keep only time-ish words from the remainder.
 * "bestbuy about two years ago" → "Best Buy · about two years ago";
 * "the ecovacs website" → "Ecovacs official store". Exported for the
 * LLM reply validator, which shapes the model's purchase answers the
 * same way.
 */
export function formatPurchaseValue(raw: string): string {
  const text = cleanValue(raw);
  const channel = canonicalPurchaseChannel(text);
  if (!channel) return text;

  let rest = text;
  for (const entry of PURCHASE_CHANNELS) rest = rest.replace(entry.pattern, ' ');
  const words = rest
    .replace(/[^A-Za-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 0 &&
        (WHEN_WORDS.has(w.toLowerCase()) || /^\d{1,4}$/.test(w))
    )
    .slice(0, 8);
  while (words.length > 0 && WHEN_GLUE.has(words[0].toLowerCase())) words.shift();
  while (words.length > 0 && WHEN_GLUE.has(words[words.length - 1].toLowerCase())) words.pop();
  const when = words.join(' ');
  return when ? `${channel} · ${when}` : channel;
}

/**
 * Speech → form-field extraction patterns. Each entry maps natural phrases
 * to a form field ID, scoped to the speaker who says them:
 *
 *  - customer fields parse the CUSTOMER's first-person speech only, so the
 *    agent's greeting ("My name is Jake, how can I help?") can never land
 *    in the Customer Name field;
 *  - agent patterns are dictation-style phrasings the agent uses while
 *    confirming what the customer said ("their number is…");
 *  - "any" patterns are speaker-independent (models, issue clauses).
 */
export const FIELD_PATTERNS: FieldPatternEntry[] = [
  {
    fieldId: 'customerName',
    label: 'Customer Name',
    customer: [
      /\bmy name is\s+([A-Za-z][A-Za-z\s'-]*?)(?:\.|,| and | calling| regarding|,? (?:and|but)|$)/i,
      /\b(?:this is|i am|i'm)\s+([A-Z][A-Za-z\s'-]*?)(?:\.|,| and | calling| regarding|$)/,
      /\b(?:^|[,.!?]\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){0,2})\s+(?:here|speaking)\b/,
      /\bname[' ]?s?\s+(?:is\s+)?([A-Za-z][A-Za-z\s'-]*?)(?:\.|,| and | calling| regarding|$)/i,
    ],
    agent: [
      /\bcustomer'?s? name is\s+([A-Za-z][A-Za-z\s'-]*?)(?:\.|,| and | calling| regarding|$)/i,
      /\bname of the customer is\s+([A-Za-z][A-Za-z\s'-]*?)(?:\.|,| and |$)/i,
      // Read-back confirmation: "And your name is Rodrik." — the agent
      // dictating the CUSTOMER's name back to them (optional trailing
      // "is/was" so ASR garble like "Rodrik is." captures just "Rodrik")
      /\byour name is\s+([A-Za-z][A-Za-z\s'-]*?)\s*(?:is|was)?\s*(?:\.|,| right| yeah| yes| ok(?:ay)?| and|$)/i,
      // Agent confirming a correction: "Dominique, right?"
      /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z'-]+){0,2}),\s*right\?/,
      /\b(?:am i|and) (?:speaking|talking) with\s+([A-Za-z][A-Za-z\s'-]*?)(?:\?|\.|,|$)/i,
      /\bis this\s+([A-Z][A-Za-z\s'-]*?)\s*(?:\?|calling|speaking|$)/,
      /\b(?:thank you|thanks|okay|alright),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){0,2}),?\s+(?:let me|i'?ll|so)\b/,
      /\b(?:calling|registered) (?:as|under)\s+([A-Za-z][A-Za-z\s'-]*?)(?:\.|,|$)/i,
    ],
  },
  {
    fieldId: 'contactNumber',
    label: 'Contact Number',
    // Every pattern CAPTURES just the digits — without a group the whole
    // phrase ("your phone number is 310-173-4037") lands in the field.
    customer: [
      /\bmy (?:phone|contact|cell|telephone|best) (?:number )?(?:is|at)?\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /\bmy number'?s?\s+(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /(?:\bcall|\btext|\breach)\s+(?:me|us)\s+(?:at|on|back at)\s+(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /\bit'?s\s+(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
    ],
    agent: [
      /\b(?:customer'?s?|their|his|her|your) (?:phone|contact|cell|telephone|best) (?:number )?(?:is|at)?\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /\b(?:customer'?s?|their|his|her) number'?s?\s+(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /\bis\s+(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\s+(?:the|a good|the best) (?:number|one) to (?:reach|call|get)\b/i,
      /\b(?:best|good) (?:number|way) to (?:reach|call|get) (?:you |him |her |them )?(?:at|is|on)?\s*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /\b(?:let me|i'?ll) (?:confirm|verify|read|repeat|double[- ]?check)[^.]{0,30}?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
    ],
    any: [
      /(\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b)/,
    ],
  },
  {
    fieldId: 'emailAddress',
    label: 'Email Address',
    customer: [
      /\bmy (?:email|email address)'?s?\s+(?:is|at)?\s*([a-zA-Z0-9._%+-]+(?:\s+at\s+|@)[a-zA-Z0-9.-]+(?:\s+dot\s+|\.)[a-zA-Z]{2,6})/i,
      /\bemail'?s?\s+(?:is|at)?\s*([a-zA-Z0-9._%+-]+(?:\s+at\s+|@)[a-zA-Z0-9.-]+(?:\s+dot\s+|\.)[a-zA-Z]{2,6})/i,
      /([a-zA-Z0-9][a-zA-Z0-9._%+-]*\s+at\s+[a-zA-Z0-9.-]+?\s+dot\s+[a-zA-Z]{2,6})/i,
    ],
    agent: [
      /\b(?:customer'?s?|their|his|her|your) (?:email|email address)\s+(?:is|at)?\s*([a-zA-Z0-9._%+-]+(?:\s+at\s+|@)[a-zA-Z0-9.-]+(?:\s+dot\s+|\.)[a-zA-Z]{2,6})/i,
      /\b(?:let me|i'?ll) (?:confirm|verify|read|repeat|double[- ]?check)[^.]{0,30}?([a-zA-Z0-9._%+-]+(?:\s+at\s+|@)[a-zA-Z0-9.-]+(?:\s+dot\s+|\.)[a-zA-Z]{2,6})/i,
    ],
    any: [
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    ],
  },
  {
    fieldId: 'deebotModel',
    label: 'Robot Model',
    // GOAT lawn-mower models are all 4-digit (O1000, A2500, O1200…), Deebot
    // models 1-3 digits (X2, T30, N20) — so \d{1,4}… except ASR spells the
    // GOAT letter-O as a zero ("O1000 LiDAR PRO" → "01000 LIDAR Pro"), a
    // FIVE-digit run: \d{1,5} keeps the whole token (canonicalization's
    // O↔0 pass then maps it back). Suffixes must include the mower
    // variants (RTK, LiDAR, Care Kit) or "you have a O1000 RTK" captures
    // only "O1000" and canonicalizes to the wrong option.
    customer: [
      /\b(?:i have|i'?ve got|i got|it'?s|model is|my (?:deebot|goat|winbot|robot|machine|vacuum) is|i'?m (?:using|calling about)|i bought|i purchased|i ordered)\s+(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,5}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|kit|ultra|ai|rtk|lidar|s|se|x|white|black|complete))*)/i,
      /\bmy (?:deebot|goat|winbot|robot|machine|vacuum)(?:'s| is| is a)?\s+(?:a\s+|an\s+|the\s+)?([a-z]?\d{1,5}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|kit|ultra|ai|rtk|lidar|s|se|x|white|black|complete))*)/i,
    ],
    agent: [
      /\b(?:what|which) (?:model|deebot|robot|machine|vacuum|mower)\b.{0,60}?\b(?:is it|do you have|have you got|you'?re using|is (?:that|this))?\s*([a-z]?\d{1,5}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|kit|ultra|ai|rtk|lidar|s|se|x|white|black|complete))*)?/i,
      /\b(?:you have|you'?ve got|you'?re using|your (?:deebot|goat|robot|machine|vacuum|mower) is|is it (?:a|an|the))\s+(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,5}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|kit|ultra|ai|rtk|lidar|s|se|x|white|black|complete))*)/i,
      /\b(?:so (?:that'?s|it'?s|we'?re talking about)|the (?:model|deebot) is|model number is)\s+(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,5}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|kit|ultra|ai|rtk|lidar|s|se|x|white|black|complete))*)/i,
    ],
    any: [
      /\bmodel (?:is|number is)?\s*:?\s*(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,5}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|kit|ultra|ai|rtk|lidar|s|se|x|white|black|complete))*)/i,
    ],
  },
  {
    fieldId: 'skuNumber',
    label: 'SKU Number',
    // The capture requires a digit: real SKUs/serials are alphanumeric
    // identifiers. Without it, "the sku number is fine" backtracks and
    // captures the word "number" itself.
    customer: [
      /\bsku\s*(?:number|code)?\s*(?:is|:)?\s*(?=[a-z0-9-]*\d)([a-z0-9-]{4,})/i,
    ],
    agent: [
      /\b(?:the |your |customer'?s )?sku\s*(?:number|code)?\s*(?:is|:)?\s*(?=[a-z0-9-]*\d)([a-z0-9-]{4,})/i,
    ],
  },
  {
    fieldId: 'serialNumber',
    label: 'Serial Number',
    // Same digit requirement as the SKU patterns — "I have the serial
    // number and do you want it too?" must match NOTHING, not "number".
    customer: [
      /\bserial\s*(?:number|no\.?|is)?\s*(?:is|:)?\s*(?=[a-z0-9-]*\d)([a-z0-9-]{4,})/i,
      /\bs\s*\/?\s*n\s*(?:number|no\.?)?\s*(?:is|:)?\s*(?=[a-z0-9-]*\d)([a-z0-9-]{4,})/i,
    ],
    agent: [
      /\b(?:the |your |customer'?s )?serial\s*(?:number|no\.?|is)?\s*(?:is|:)?\s*(?=[a-z0-9-]*\d)([a-z0-9-]{4,})/i,
      /\b(?:customer'?s?|their|his|her|your) s\s*\/?\s*n\s*(?:number|no\.?)?\s*(?:is|:)?\s*(?=[a-z0-9-]*\d)([a-z0-9-]{4,})/i,
      /\b(?:let me|i'?ll) (?:confirm|verify|read|repeat|double[- ]?check)[^.]{0,30}?\b(?=[a-z0-9]*\d)([a-z0-9]{6,}[-a-z0-9]*)/i,
    ],
  },
  {
    // Primarily LLM-parsed ("when and where was it acquired" needs context
    // understanding), with a widened regex backstop for the explicit
    // phrasings: "you purchased this machine from Amazon one year ago",
    // "I picked it up at Best Buy", "we ordered it through your website",
    // "I got it off of eBay last March". The `any` channel-led pattern
    // catches a known retailer after a preposition even with no purchase
    // verb ("it's the one from Costco"); candidates naming a real channel
    // beat pronoun junk ("from him"), and every value is shaped into
    // "Channel · when" (see formatPurchaseValue).
    // NOTE: no `g` flag — a global flag makes String.match() return whole
    // matches only (no capture groups), which is how "purchased this
    // machine from Amazon one year ago" landed in the field verbatim.
    fieldId: 'purchaseInfo',
    label: 'Purchase',
    agent: [
      /\b(?:purchased|bought|got|ordered|grabbed|acquired)\b[^.!?]{0,25}?\b(?:from|at|on|off of|through|via)\s+([A-Za-z0-9][A-Za-z0-9 .'-]{2,60}?)(?:\.|,|$)/i,
    ],
    customer: [
      /\b(?:i|we) (?:purchased|bought|got|ordered|grabbed|acquired|picked (?:it|this|the|one)? ?up)\b[^.!?]{0,25}?\b(?:from|at|on|off of|through|via)\s+([A-Za-z0-9][A-Za-z0-9 .'-]{2,60}?)(?:\.|,|$)/i,
    ],
    any: [
      /\b(?:from|at|on|off of|through|via)\s+(?:the\s+|my\s+|your\s+)?(amazon|best ?buy|e-?bay|target|walmart|wal-?mart|costco|sam'?s ?club|home ?depot|lowe'?s|fred ?meyer|kohl'?s|macy'?s|newegg|wayfair|bed bath (?:and|&) beyond|micro ?center|aliexpress|rakuten|temu|qvc|hsn|ecovacs(?:\.com|'?s (?:website|store|site))?|official (?:store|site|website)|your (?:website|store|site))\b/i,
    ],
  },
  {
    fieldId: 'issueDescription',
    label: 'Issue Description',
    accumulate: true,
    join: '; ',
    customer: [
      /\b(?:the )?(?:issue|problem|concern|trouble|matter|reason (?:i'?m|for) call(?:ing)?) (?:is|was)\s+(?:that\s+)?([^.!?]{10,300})/gi,
      /\bi'?m (?:calling|phoning|contacting you|reaching out) because\s+(?:my |the )?([^.!?]{10,300})/gi,
      /\bi'?m having (?:a |an |some )?(?:problem|issue|trouble|difficulties|difficulty)s? with\s+(?:my |the )?([^.!?]{10,300})/gi,
      /\bmy (?:robot|deebot|vacuum|machine|goat|winbot|device|unit)\s+(?:keeps?|is|won'?t|wouldn'?t|doesn'?t|does not|can'?t|cannot|isn'?t|stopped|keeps? on)\s+([^.!?]{5,300})/gi,
      // Recall-first verb list: "it doesn't pick up", "it makes a grinding
      // noise", "it gets stuck", "it sounds weird" are all complaint clauses
      // the narrow verb set used to skip.
      /\bit\s+(?:keeps?|is|was|would|won'?t|wouldn'?t|kept|doesn'?t|does not|does|can'?t|cannot|isn'?t|stopped|started|quit|gets?|got|makes?|sounds?|seems?|smells?|leaks?|drains?|dies?|stops?|runs?)\s+([^.!?]{5,300})/gi,
      // Part/order REQUESTS — the reason for the call may be a request, not
      // a malfunction: "is there a way that I could get that part
      // ordered?", "I want to buy a replacement dust box". Requires a
      // part-ish noun near the request verb so ordinary complaints
      // ("get the upgraded 1000") never match.
      /\b((?:is there a way|how (?:do|can|could) i|where can i|can i|could i)\b[^.!?]{0,40}?\b(?:get|order|buy|purchase|replace)\b[^.!?]{0,60}\b(?:part|accessor(?:y|ies)?|spare|replacement|dust ?box|dustbin|filter|brush|battery|remote|dock|cord|adapter|bag)\b[^.!?]{0,60})/gi,
      /\bi (?:need|want|would like|wanna)\b[^.!?]{0,20}?\b((?:to )?(?:get|order|buy|purchase|replace)\b[^.!?]{0,60}\b(?:part|accessor(?:y|ies)?|spare|replacement|dust ?box|dustbin|filter|brush|battery|remote|dock|cord|adapter|bag)\b[^.!?]{0,60})/gi,
      // A misplaced/lost part IS the complaint: "it just got misplaced",
      // "the dust box is damaged". The verb slot is REQUIRED — a bare
      // "it damaged" is the agent's clarifying question ("Is it
      // damaged?") riding a scrambled diarization, never a complaint.
      /\b((?:it|the (?:part|piece|dust ?box|bin|container|filter|brush|remote|accessor\w*))(?:'s|\s+(?:just\s+|has\s+|hasn'?t\s+)?(?:got|gotten|been|is|was|went|seems?|looks?))\s+(?:misplaced|lost|missing|went missing|broken|damaged))\b/gi,
    ],
    agent: [
      /\b(?:issue|problem|concern|trouble|matter) (?:is|was|with the)\s+(?:that\s+|a\s+|the\s+)?([^.!?]{10,300})/gi,
      // Agent read-back phrasings: "the main issue you have is a diem
      // battery" / "the main issue with your O1000 RTK model is that it
      // cannot mow some areas"
      /\bmain (?:issue|problem|concern)\b[^.!?]{0,60}?\bis (?:that\s+)?([^.!?]{10,300})/gi,
      /\b(?:issue|problem|concern|trouble) (?:you have|you'?re having|you'?re experiencing|with your)\b[^.!?]{0,40}?\bis\s+(?:that\s+|a\s+|the\s+)?([^.!?]{6,300})/gi,
    ],
  },
  {
    fieldId: 'resolutionSummary',
    label: 'Resolution Summary',
    accumulate: true,
    join: ' -> ',
    agent: [
      /\b(?:let'?s|lets) (?:try to |try |go ahead and |see if we can |see if |)([a-z][^.!?]{8,300})(?!\s*\?)/gi,
      // Instructions phrased as questions are still advice ("can you check
      // the wheels?") — but information-gathering questions are not
      // ("can you describe the issue?"). The trailing (?:[.!]|$) rejects
      // QUESTION sentences: the capture must run to a statement terminator,
      // and a sentence ending in "?" has none.
      /\b(?:can|could|would) you (?!describe\b|tell\b|explain\b|confirm\b|clarify\b|know\b|remember\b|mention\b|share\b|provide\b|walk\b)(?:please |try to |try |)([a-z][^.!?]{8,300})(?:[.!]|$)/gi,
      // Diagnostic/confirming QUESTIONS the agent asks — the resolution box
      // chronicles basically everything the agent says, and a question is
      // part of the troubleshooting record ("did you check the power?",
      // "have you tried restarting it?", "is the light red?",
      // "any recent wifi changes?"). Whole-match captures: the paraphrase
      // stage condenses them into terse checks ("checked power state?");
      // without a model the verbatim question still lands on the ticket.
      /\bdid you\b[^.!?]{3,90}\?/gi,
      /\bhave you\b[^.!?]{3,90}\?/gi,
      /\b(?:do|does) (?:you|the|it|they|your)\b[^.!?]{3,90}\?/gi,
      /\b(?:is|was|are|were) (?:it|that|the|there)\b[^.!?]{3,70}\?/gi,
      /\bany (?:recent )?(?:changes?|issues?|problems?|errors?|updates?|damage|noise)\b[^.!?]{0,70}\?/gi,
      /\bplease (?:press|hold|try|check|confirm|restart|reset|power ?cycle|remove|clean|open|close|go ahead|disconnect|reconnect|download|install|connect|update|verify|make sure)([^.!?]{0,300})/gi,
      /\b(?:i'?m|i am) (?:going to|gonna) (?:send|email|process|submit|create|issue|set ?up|escalate|arrange|schedule|replace|refund|order|generate|open|add|remove|update|review|walk you through|check|look|note|follow up)([^.!?]{0,300})/gi,
      /\b(?:you'?ll|you will|we'?ll|we will|you|we) (?:need to|have to|wanna|going to) ([a-z][^.!?]{8,300})/gi,
      /\bmake sure (?:to |that |you |the )([a-z][^.!?]{5,300})/gi,
      /\bgo ahead and ([a-z][^.!?]{8,300})/gi,
      /\bhold (?:down |the |on )?(?:power )?button ([a-z][^.!?]{5,300})/gi,
      // Agent dictating the resolution: "So my resolution will be you
      // reset the machine and you restart the…"
      /\b(?:my|our|the) resolution (?:steps? )?(?:will be|is|would be|are)\s+(?:to\s+|that\s+(?:you|we)\s+)?([a-z][^.!?]{8,300})/gi,
      // Imperative advice to the customer: "and you put it back into the
      // base station to charge it and see how it behaves". Verb list
      // includes the procedural/guidance verbs (click, go, log, type,
      // select, visit, use, keep…) or website walk-throughs ("you can
      // just click on the trading page") never register as steps.
      /\byou (?:reset|restart|reboot|power ?cycle|charge|clean|check|press|hold|remove|reconnect|replace|place|put|empty|fill|install|update|map|run|start|stop|pause|resume|disconnect|turn|take|wipe|inspect|examine|test|verify|confirm|ensure|adjust|reseat|seat|tighten|loosen|send|leave|click|go|log|type|select|visit|use|keep|enter|find|subscribe|return|trade)\b[^.!?]{4,300}/gi,
      // Advice phrased with a modal — BY FAR the most common real-agent
      // phrasing ("you can just go onto the website and go into the
      // trading program", "you just log in and then type in your current
      // one", "you can definitely call us back"). Same statement-
      // terminator guard as above; leading adverbs are skipped so the
      // step starts with the action verb.
      /\byou (?:can|could|just|should|may|might|definitely|still|also|then|simply)\s+(?:just\s+|simply\s+|then\s+|also\s+|still\s+|definitely\s+)?([a-z][^.!?]{8,300})(?:[.!]|$)/gi,
      /\byou(?:'ll| will| would) be able to\s+([a-z][^.!?]{8,300})/gi,
      // "I would suggest (you) keep using it for a bit" — the agent's own
      // recommendation phrasing
      /\bi (?:would|'d) (?:suggest|recommend)\s+(?:that\s+|you\s+|we\s+|to\s+)?([a-zA-Z][^.!?]{8,300})/gi,
    ],
  },
];

// ---------------------------------------------------------------------------
//  Extraction helpers
// ---------------------------------------------------------------------------

/** Normalize a spoken value: collapse whitespace, strip trailing punctuation */
function cleanValue(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/, '')
    .replace(/^[,;:]+/, '')
    .trim();
}

/** Spoken email addresses: "john at gmail dot com" → john@gmail.com */
function normalizeSpokenEmail(value: string): string {
  return value.replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.');
}

/** Extract a spoken model from pattern match groups (brand + token) */
function extractModelValue(match: RegExpMatchArray): string {
  // Model patterns capture (brand?, token) — join non-empty groups
  const parts = [match[1], match[2]].filter(Boolean).map((g) => String(g).trim());
  return parts.join(' ').replace(/\s+/g, ' ');
}

/**
 * Collect every capture from the 'g'-flagged accumulate patterns over text,
 * deduped case-insensitively, order preserved.
 */
function collectAccumulated(text: string, patterns: RegExp[]): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      // Trailing ", right" is read-back confirmation noise ("a diem
      // battery, right?") — never part of the actual complaint/step
      const value = cleanValue(match[1] ?? match[0]).replace(/,?\s*\bright\b$/i, '');
      const key = value.toLowerCase();
      if (value.length < 4 || seen.has(key)) continue;
      // Containment dedup — several patterns legitimately match the same
      // span at different lengths ("you reset the machine" vs "you reset
      // the machine and you put it back into the base station…"): the
      // longer capture SUBSUMES the shorter one, so keep only the longest
      // instead of stacking near-duplicate steps.
      if (results.some((r) => r.toLowerCase().includes(key))) continue;
      const subsumes = results.findIndex((r) => key.includes(r.toLowerCase()));
      if (subsumes >= 0) results.splice(subsumes, 1);
      seen.add(key);
      results.push(value);
    }
  }
  return results;
}

/**
 * Fields whose extraction GROWS as the call goes on: the joined issue
 * clauses, the joined resolution steps, and the issue type classified from
 * those clauses. Every other field is first-wins — its first confident
 * parse should not be churned by later, noisier mentions.
 *
 * The call-capture hook uses this to decide whether a re-extracted regex
 * value may REPLACE an already-pushed one (accumulating: yes, whenever the
 * value changed) or must leave it alone (scalar: first fill sticks).
 */
export const ACCUMULATING_FIELD_IDS: ReadonlySet<string> = new Set(
  FIELD_PATTERNS.filter((p) => p.accumulate).map((p) => p.fieldId).concat('issueType')
);

/**
 * Speaker-aware field extraction over the tagged transcript.
 *
 * Customer fields run only against the customer's utterances (so the agent's
 * "My name is Jake" greeting never lands in Customer Name); agent patterns
 * catch the agent dictating/confirming the customer's details; model names
 * parse from either speaker. The customer's complaint clauses and the
 * agent's TBS steps accumulate across the whole call.
 */
export function extractFields(entries: TranscriptEntry[]): ExtractedField[] {
  if (entries.length === 0) return [];

  const customerText = entries
    .filter((e) => e.speaker === 'customer')
    .map((e) => e.text)
    .join(' ');
  const agentText = entries
    .filter((e) => e.speaker === 'agent')
    .map((e) => e.text)
    .join(' ');

  const results: ExtractedField[] = [];
  const issueClauses: string[] = [];
  const seenFields = new Set<string>();

  for (const entry of FIELD_PATTERNS) {
    if (seenFields.has(entry.fieldId)) continue;

    if (entry.fieldId === 'purchaseInfo') {
      // Purchase info gets its own scan: run EVERY pattern (speaker pools
      // plus the channel-led `any` fallback) and prefer a candidate that
      // names a real purchase channel over pronoun junk ("from him") —
      // then shape the winner into "Channel · when".
      const candidates: string[] = [];
      const pools: Array<{ text: string; patterns: RegExp[] }> = [];
      if (customerText) pools.push({ text: customerText, patterns: entry.customer ?? [] });
      if (agentText) pools.push({ text: agentText, patterns: entry.agent ?? [] });
      if (customerText || agentText) {
        pools.push({ text: `${customerText} ${agentText}`.trim(), patterns: entry.any ?? [] });
      }
      for (const pool of pools) {
        for (const pattern of pool.patterns) {
          const match = pool.text.match(pattern);
          if (match) candidates.push(match[1] ?? match[0]);
        }
      }
      const best =
        candidates.find((c) => canonicalPurchaseChannel(c)) ?? candidates[0];
      if (best) {
        const value = formatPurchaseValue(best);
        // Without a recognized channel the capture is usually a pronoun or
        // person ("from him", "from a guy") — keep it only when it's long
        // enough to be a real place ("a local vacuum shop")
        const noChannelJunk =
          /^(?:him|her|them|there|here|somebody|someone|anybody|you|me|us|that|this guy|the guy|a guy|my husband|my wife|my son|my daughter)\b/i;
        if (
          value.length > 2 &&
          (canonicalPurchaseChannel(value) ||
            (value.length >= 6 && !noChannelJunk.test(value)))
        ) {
          seenFields.add(entry.fieldId);
          results.push({ fieldId: entry.fieldId, value, confidence: 'medium' });
        }
      }
      continue;
    }

    if (entry.fieldId === 'issueDescription') {
      // Customer complaints, plus the customer's answer to the agent's
      // "what's the issue?" question
      issueClauses.push(...collectAccumulated(customerText, entry.customer ?? []));
      issueClauses.push(...collectAccumulated(agentText, entry.agent ?? []));

      let pendingQuestion = false;
      for (const e of entries) {
        if (e.speaker === 'agent' && AGENT_ISSUE_QUESTION.test(e.text)) {
          pendingQuestion = true;
        } else if (e.speaker === 'customer' && pendingQuestion) {
          const answer = cleanValue(e.text);
          if (answer.length >= 10) issueClauses.push(answer);
          pendingQuestion = false;
        }
      }
      // Dedupe + cap the accumulated clauses. The cap is deliberately high
      // (30): the contract is recall-first — every distinct customer point
      // becomes a clause and a human deletes irrelevant ones later — so the
      // provisional layer must not silently drop the second half of a long
      // call the way it used to.
      const unique: string[] = [];
      const seen = new Set<string>();
      for (const clause of issueClauses) {
        const key = clause.toLowerCase();
        if (!seen.has(key) && unique.length < 30) {
          seen.add(key);
          unique.push(clause);
        }
      }
      if (unique.length > 0) {
        seenFields.add(entry.fieldId);
        results.push({
          fieldId: entry.fieldId,
          value: unique.join(entry.join ?? '; '),
          confidence: 'medium',
        });
      }
      continue;
    }

    if (entry.accumulate) {
      // Resolution steps (agent-only) — collect and dedupe
      const steps = collectAccumulated(agentText, entry.agent ?? []);
      if (steps.length > 0) {
        seenFields.add(entry.fieldId);
        results.push({
          fieldId: entry.fieldId,
          value: steps.slice(0, 12).join(entry.join ?? ' -> '),
          confidence: 'medium',
        });
      }
      continue;
    }

    // First-wins scalar fields, scoped per speaker
    const pools: Array<{ text: string; patterns: RegExp[] }> = [];
    if (customerText) pools.push({ text: customerText, patterns: entry.customer ?? [] });
    if (agentText) pools.push({ text: agentText, patterns: entry.agent ?? [] });
    if (customerText || agentText) {
      pools.push({ text: `${customerText} ${agentText}`.trim(), patterns: entry.any ?? [] });
    }

    for (const pool of pools) {
      for (const pattern of pool.patterns) {
        const match = pool.text.match(pattern);
        if (!match) continue;

        let value: string;
        if (entry.fieldId === 'deebotModel') {
          value = extractModelValue(match);
        } else {
          value = match[1] ?? match[0];
        }
        value = cleanValue(value);

        if (entry.fieldId === 'emailAddress') {
          value = cleanValue(normalizeSpokenEmail(value));
        }
        if (entry.fieldId === 'deebotModel') {
          value = matchCanonicalModel(value) ?? value;
        }
        if (value.length <= 2) continue;

        const confidence: ExtractedField['confidence'] =
          entry.fieldId === 'emailAddress' ||
          entry.fieldId === 'contactNumber' ||
          entry.fieldId === 'serialNumber' ||
          entry.fieldId === 'skuNumber'
            ? 'high'
            : 'medium';

        seenFields.add(entry.fieldId);
        results.push({ fieldId: entry.fieldId, value, confidence });
        break; // first matching pattern wins for this field
      }
      if (seenFields.has(entry.fieldId)) break;
    }
  }

  // --- Issue type: keyword classification over customer speech + clauses ---
  const issueSource = `${customerText} ${issueClauses.join(' ')}`;
  let issueType = classifyIssueType(issueSource);
  if (!issueType) {
    // Fall back to the issue description — canonicalize or condense it
    const descResult = results.find((f) => f.fieldId === 'issueDescription');
    if (descResult) {
      issueType =
        classifyIssueType(descResult.value) ??
        canonicalIssueType(descResult.value) ??
        summarizeIssueType(descResult.value);
    }
  }
  if (issueType) {
    results.push({ fieldId: 'issueType', value: issueType, confidence: 'medium' });
  }

  return results;
}
