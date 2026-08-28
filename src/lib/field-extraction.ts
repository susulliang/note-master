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
  { pattern: /\b(?:doesn'?t|not)\s+(?:clean|vacuum|sweep|mop)\s+(?:at all|anything|the floor|the carpet)\b/i, value: 'Failure::Fail to vacuum' },
  { pattern: /\b(?:runs?|drives?) (?:over|through) (?:pet|dog|cat)\b.{0,25}\b(?:feces|poop|pee)\b/i, value: 'Failure::Damaged by pet/animal feces' },
  { pattern: /\b(?:random|erratic|wrong|weird|crazy)\s+(?:route|path|pattern)\b/i, value: 'Failure::Repeated cleaning/chaotic route' },
  { pattern: /\brepeat(?:s|ing|ed)\b.{0,30}\b(?:same (?:area|spot|place)|over and over|again and again)\b/i, value: 'Failure::Repeated cleaning/chaotic route' },

  // --- Noise / mechanical ---
  { pattern: /\b(?:making|makes|made)\s+(?:a\s+)?(?:loud|weird|strange|funny|grinding|squeaking|clicking|abnormal)\s+(?:noise|sound|noises|sounds)\b/i, value: 'Failure::Robot making abnormal sound/noise' },
  { pattern: /\b(?:very |really )?noisy\b|\b(?:grind|squeak|click|rattle)(?:ing|s)? (?:sound|noise)?\b/i, value: 'Failure::Robot making abnormal sound/noise' },
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
  /(?:what(?:'?s| is| seems to be) (?:the |going on|happening|the matter)|what can i do for you|how can i help|how may i help|tell me (?:what|about|more)|what'?s (?:wrong|the problem|the issue|the trouble|bothering)|describe (?:the|your) (?:issue|problem)|how'?s (?:it|the (?:robot|machine)) (?:doing|going)|what'?s it doing)/i;

// ---------------------------------------------------------------------------
//  Model canonicalization — spoken model token → exact combobox option
// ---------------------------------------------------------------------------

function normalizeModelKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9+]/g, '');
}

/**
 * Match a spoken model token against the canonical model list and return the
 * exact option, or null when nothing matches ("T9 plus" → "T9+ White",
 * "x2 omni" → "X2 OMNI"; exact match first, then shortest prefix match).
 * Exported for the LLM field parser, which must REJECT hallucinated names.
 */
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
    if (key.length >= 3 && optKey.startsWith(key)) {
      if (!best || normalizeModelKey(best).length > optKey.length) best = option;
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
      /\b(?:am i|and) (?:speaking|talking) with\s+([A-Za-z][A-Za-z\s'-]*?)(?:\?|\.|,|$)/i,
      /\bis this\s+([A-Z][A-Za-z\s'-]*?)\s*(?:\?|calling|speaking|$)/,
      /\b(?:thank you|thanks|okay|alright),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'-]+){0,2}),?\s+(?:let me|i'?ll|so)\b/,
      /\b(?:calling|registered) (?:as|under)\s+([A-Za-z][A-Za-z\s'-]*?)(?:\.|,|$)/i,
    ],
  },
  {
    fieldId: 'contactNumber',
    label: 'Contact Number',
    customer: [
      /\bmy (?:phone|contact|cell|telephone|best) (?:number )?(?:is|at)?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
      /\bmy number'?s?\s+\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
      /(?:\bcall|\btext|\breach)\s+(?:me|us)\s+(?:at|on|back at)\s+\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
      /\bit'?s\s+\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
    ],
    agent: [
      /\b(?:customer'?s?|their|his|her|your) (?:phone|contact|cell|telephone|best) (?:number )?(?:is|at)?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
      /\b(?:customer'?s?|their|his|her) number'?s?\s+\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
      /\bis\s+\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\s+(?:the|a good|the best) (?:number|one) to (?:reach|call|get)\b/i,
      /\b(?:best|good) (?:number|way) to (?:reach|call|get) (?:you |him |her |them )?(?:at|is|on)?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
      /\b(?:let me|i'?ll) (?:confirm|verify|read|repeat|double[- ]?check)[^.]{0,30}?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i,
    ],
    any: [
      /\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
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
    label: 'Deebot Model',
    customer: [
      /\b(?:i have|i'?ve got|i got|it'?s|model is|my (?:deebot|goat|winbot|robot|machine|vacuum) is|i'?m (?:using|calling about)|i bought|i purchased|i ordered)\s+(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,3}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|ultra|ai|s|se|x|white|black|complete))*)/i,
      /\bmy (?:deebot|goat|winbot|robot|machine|vacuum)(?:'s| is| is a)?\s+(?:a\s+|an\s+|the\s+)?([a-z]?\d{1,3}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|ultra|ai|s|se|x|white|black|complete))*)/i,
    ],
    agent: [
      /\b(?:what|which) (?:model|deebot|robot|machine|vacuum)\b.{0,60}?\b(?:is it|do you have|have you got|you'?re using|is (?:that|this))?\s*([a-z]?\d{1,3}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|ultra|ai|s|se|x|white|black|complete))*)?/i,
      /\b(?:you have|you'?ve got|you'?re using|your (?:deebot|robot|machine|vacuum) is|is it (?:a|an|the))\s+(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,3}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|ultra|ai|s|se|x|white|black|complete))*)/i,
      /\b(?:so (?:that'?s|it'?s|we'?re talking about)|the (?:model|deebot) is|model number is)\s+(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,3}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|ultra|ai|s|se|x|white|black|complete))*)/i,
    ],
    any: [
      /\bmodel (?:is|number is)?\s*:?\s*(?:a\s+|an\s+|the\s+)?(deebot|goat|winbot|ozmo)?\s*([a-z]?\d{1,3}[a-z]?\+?(?:\s*(?:omnicyclone|omni|pro|max|plus|combo|turbo|care|ultra|ai|s|se|x|white|black|complete))*)/i,
    ],
  },
  {
    fieldId: 'skuNumber',
    label: 'SKU Number',
    customer: [
      /\bsku\s*(?:number|code)?\s*(?:is|:)?\s*([a-z0-9-]{4,})/i,
    ],
    agent: [
      /\b(?:the |your |customer'?s )?sku\s*(?:number|code)?\s*(?:is|:)?\s*([a-z0-9-]{4,})/i,
    ],
  },
  {
    fieldId: 'serialNumber',
    label: 'Serial Number',
    customer: [
      /\bserial\s*(?:number|no\.?|is)?\s*(?:is|:)?\s*([a-z0-9-]{4,})/i,
      /\bs\s*\/?\s*n\s*(?:number|no\.?)?\s*(?:is|:)?\s*([a-z0-9-]{4,})/i,
    ],
    agent: [
      /\b(?:the |your |customer'?s )?serial\s*(?:number|no\.?|is)?\s*(?:is|:)?\s*([a-z0-9-]{4,})/i,
      /\b(?:customer'?s?|their|his|her|your) s\s*\/?\s*n\s*(?:number|no\.?)?\s*(?:is|:)?\s*([a-z0-9-]{4,})/i,
      /\b(?:let me|i'?ll) (?:confirm|verify|read|repeat|double[- ]?check)[^.]{0,30}?\b([a-z0-9]{6,}[-a-z0-9]*)/i,
    ],
  },
  {
    // LLM-only field: "when and where was it acquired" needs context
    // understanding (channel + date are usually scattered across phrases),
    // so there are deliberately no regex patterns — the label exists for
    // the parsed-field chips in the caption panel.
    fieldId: 'purchaseInfo',
    label: 'Purchase',
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
      /\bit\s+(?:keeps?|is|won'?t|wouldn'?t|doesn'?t|does not|can'?t|cannot|isn'?t|stopped|started|quit|stopped)\s+([^.!?]{5,300})/gi,
    ],
    agent: [
      /\b(?:issue|problem|concern|trouble|matter) (?:is|was|with the)\s+(?:that\s+|a\s+|the\s+)?([^.!?]{10,300})/gi,
    ],
  },
  {
    fieldId: 'resolutionSummary',
    label: 'Resolution Summary',
    accumulate: true,
    join: ' -> ',
    agent: [
      /\b(?:let'?s|lets) (?:try to |try |go ahead and |see if we can |see if |)([a-z][^.!?]{8,300})/gi,
      /\b(?:can|could|would) you (?:please |try to |try |)([a-z][^.!?]{8,300})/gi,
      /\bplease (?:press|hold|try|check|confirm|restart|reset|power ?cycle|remove|clean|open|close|go ahead|disconnect|reconnect|download|install|connect|update|verify|make sure)([^.!?]{0,300})/gi,
      /\b(?:i'?m|i am) (?:going to|gonna) (?:send|email|process|submit|create|issue|set ?up|escalate|arrange|schedule|replace|refund|order|generate|open|add|remove|update|review|walk you through|check|look|note|follow up)([^.!?]{0,300})/gi,
      /\b(?:you'?ll|you will|we'?ll|we will|you|we) (?:need to|have to|wanna|going to) ([a-z][^.!?]{8,300})/gi,
      /\bmake sure (?:to |that |you |the )([a-z][^.!?]{5,300})/gi,
      /\bgo ahead and ([a-z][^.!?]{8,300})/gi,
      /\bhold (?:down |the |on )?(?:power )?button ([a-z][^.!?]{5,300})/gi,
      /\b(?:let me|i'?ll) (?:check|see|look|verify|confirm|pull up|review|look into|take a look)([^.!?]{0,300})/gi,
      /^(?:do|does|did|is|are|was|were|can|could|would|will|have|has|what|where|when|why|how|which|any|so|and)\b[^.!?]{10,200}\??$/gim,
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
      const value = cleanValue(match[1] ?? match[0]);
      const key = value.toLowerCase();
      if (value.length >= 4 && !seen.has(key)) {
        seen.add(key);
        results.push(value);
      }
    }
  }
  return results;
}

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
      // Dedupe + cap the accumulated clauses
      const unique: string[] = [];
      const seen = new Set<string>();
      for (const clause of issueClauses) {
        const key = clause.toLowerCase();
        if (!seen.has(key) && unique.length < 6) {
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
