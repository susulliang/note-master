/**
 * Regression test — purchase channel + when (run: npx tsx
 * scripts/test-parser-purchase.ts).
 *
 * Requirement: the parser must catch WHERE and WHEN the unit was bought —
 * Amazon, Best Buy, eBay, the official Ecovacs store, Target, etc. — and
 * fill it into the Purchase box, formatted "Channel · when".
 *
 * Verifies:
 *
 *   1. extractFields() — every phrasing style fills purchaseInfo:
 *      agent read-back ("you purchased this machine from Amazon one year
 *      ago"), customer "picked it up at Best Buy", "ordered it through
 *      your website", "got it off of eBay last March", channel-led with no
 *      purchase verb ("it's the one from Costco");
 *   2. canonicalPurchaseChannel()/formatPurchaseValue() — ASR spellings
 *      ("bestbuy", "wal-mart", "the ecovacs website", "ecovacs.com") shape
 *      onto clean names, and cross-turn bleed is filtered out;
 *   3. buildParsePrompt() — the system prompt names the common channels and
 *      the "store first, then when" format;
 *   4. validateLlmFields() — the model's purchase answers canonicalize the
 *      same way, and junk ("from him") never fills the box.
 */

import {
  extractFields,
  canonicalPurchaseChannel,
  formatPurchaseValue,
  type TranscriptEntry,
} from '../src/lib/field-extraction';
import { buildParsePrompt, validateLlmFields } from '../src/lib/llm-parser';

// --- tiny assertion helpers ------------------------------------------------
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark} ${name}`);
  if (!ok) {
    failed += 1;
    if (detail) console.log(`      → ${detail}`);
  } else {
    passed += 1;
  }
}

/** Run extractFields over one speaker-tagged utterance list */
function purchaseOf(lines: Array<'a' | 'c', string>): string | undefined {
  const entries: TranscriptEntry[] = lines.map(([who, text]) => ({
    speaker: who === 'a' ? ('agent' as const) : ('customer' as const),
    text,
  }));
  return extractFields(entries).find((f) => f.fieldId === 'purchaseInfo')?.value;
}

console.log('\n=== 1. Spoken phrasings → Purchase box ===');

check(
  'agent read-back: "you purchased this machine from Amazon one year ago."',
  purchaseOf([['a', 'You purchased this machine from Amazon one year ago.']]) ===
    'Amazon · one year ago',
  `got: ${purchaseOf([['a', 'You purchased this machine from Amazon one year ago.']])}`
);

check(
  'customer: "I picked it up at Best Buy"',
  purchaseOf([['c', 'I picked it up at Best Buy']]) === 'Best Buy',
  `got: ${purchaseOf([['c', 'I picked it up at Best Buy']])}`
);

check(
  'customer: "we ordered it through your website about two years ago"',
  purchaseOf([['c', 'we ordered it through your website about two years ago']]) ===
    'Ecovacs official store · about two years ago',
  `got: ${purchaseOf([['c', 'we ordered it through your website about two years ago']])}`
);

check(
  'customer: "I got it off of eBay last March"',
  purchaseOf([['c', 'I got it off of eBay last March']]) === 'eBay · last March',
  `got: ${purchaseOf([['c', 'I got it off of eBay last March']])}`
);

check(
  'channel-led, no purchase verb: "it\'s the one from Costco"',
  purchaseOf([['c', "it's the one from Costco"]]) === 'Costco',
  `got: ${purchaseOf([['c', "it's the one from Costco"]])}`
);

check(
  'customer ASR spelling: "I bought it from bestbuy dot com"',
  purchaseOf([['c', 'I bought it from bestbuy dot com']]) === 'Best Buy',
  `got: ${purchaseOf([['c', 'I bought it from bestbuy dot com']])}`
);

check(
  'official store: "bought it directly from ecovacs"',
  purchaseOf([['c', 'I bought it directly from ecovacs']]) === 'Ecovacs official store',
  `got: ${purchaseOf([['c', 'I bought it directly from ecovacs']])}`
);

check(
  'no-channel junk ("from him") never fills the box',
  purchaseOf([['c', 'yeah I got it from him a while back']]) === undefined,
  `got: ${purchaseOf([['c', 'yeah I got it from him a while back']])}`
);

check(
  '"it doesn\'t target the corners" is not a Target purchase',
  purchaseOf([['c', "it doesn't target the corners at all"]]) === undefined,
  `got: ${purchaseOf([['c', "it doesn't target the corners at all"]])}`
);

// Cross-turn: channel and when land in DIFFERENT speaker turns — the regex
// backstop catches the channel ("Amazon"); composing channel + when across
// turns is the LLM layer's job (it reads the whole window). Within ONE
// capture, bleed is still filtered (see formatPurchaseValue cases below).
check(
  'channel in one turn, when in the next: the channel still fills the box',
  purchaseOf([
    ['a', 'And you bought it on Amazon'],
    ['c', 'one year ago'],
    ['c', 'My dog chewed the cable'],
  ]) === 'Amazon',
  `got: ${purchaseOf([
    ['a', 'And you bought it on Amazon'],
    ['c', 'one year ago'],
    ['c', 'My dog chewed the cable'],
  ])}`
);

// Speaker priority: a channel-bearing candidate beats an earlier pronoun
// capture from the customer pool
check(
  'a real channel beats an earlier pronoun capture',
  purchaseOf([
    ['c', 'I got it from him'],
    ['a', 'You purchased this machine from Target two years ago.'],
  ]) === 'Target · two years ago',
  `got: ${purchaseOf([
    ['c', 'I got it from him'],
    ['a', 'You purchased this machine from Target two years ago.'],
  ])}`
);

console.log('\n=== 2. Channel canonicalization ===');
const channelCases: Array<[string, string | null]> = [
  ['amazon', 'Amazon'],
  ['AMAZON', 'Amazon'],
  ['bestbuy', 'Best Buy'],
  ['Best Buy', 'Best Buy'],
  ['e bay', 'eBay'],
  ['ebay', 'eBay'],
  ['wal-mart', 'Walmart'],
  ['walmart', 'Walmart'],
  ['the ecovacs website', 'Ecovacs official store'],
  ['ecovacs.com', 'Ecovacs official store'],
  ['directly from you', 'Ecovacs official store'],
  ['from you guys', 'Ecovacs official store'],
  ['target', 'Target'],
  ["lowe's", "Lowe's"],
  ['homedepot', 'Home Depot'],
  ["sam's club", "Sam's Club"],
  ['a local vacuum shop', null],
  ['him', null],
];
for (const [raw, expected] of channelCases) {
  check(
    `canonicalPurchaseChannel(${JSON.stringify(raw)}) → ${expected}`,
    canonicalPurchaseChannel(raw) === expected,
    `got: ${canonicalPurchaseChannel(raw)}`
  );
}

const shapeCases: Array<[string, string]> = [
  ['bestbuy about two years ago', 'Best Buy · about two years ago'],
  ['Amazon one year ago My dog chewed the cable', 'Amazon · one year ago'],
  ['the ecovacs website', 'Ecovacs official store'],
  ['Costco last Black Friday', 'Costco · last Black Friday'],
  ['Walmart March 2025', 'Walmart · March 2025'],
];
for (const [raw, expected] of shapeCases) {
  check(
    `formatPurchaseValue(${JSON.stringify(raw)}) → ${JSON.stringify(expected)}`,
    formatPurchaseValue(raw) === expected,
    `got: ${formatPurchaseValue(raw)}`
  );
}

console.log('\n=== 3. Parse prompt names the channels ===');
const { system } = buildParsePrompt(
  [{ speaker: 'customer', text: 'I bought it from Amazon about a year ago' }],
  ['purchaseInfo']
);
check(
  'prompt rule lists the common channels',
  /Amazon, Best Buy, eBay, Target, Walmart, Costco, Home Depot/.test(system)
);
check(
  'prompt rule asks for store-first then when ("·" format)',
  /store\/site first/.test(system) && /·/.test(system)
);
check(
  'prompt rule names the official store',
  /official store/.test(system)
);

console.log('\n=== 4. LLM reply validation ===');
const validated = new Map(
  validateLlmFields({
    purchaseInfo: 'bought on bestbuy about two years ago',
    deebotModel: 'X2 OMNI',
  }).map((f) => [f.fieldId, f.value])
);
check(
  '"bought on bestbuy about two years ago" shapes to "Best Buy · about two years ago"',
  validated.get('purchaseInfo') === 'Best Buy · about two years ago',
  `got: ${validated.get('purchaseInfo')}`
);
const alreadyClean = new Map(
  validateLlmFields({ purchaseInfo: 'Amazon · March 2025' }).map((f) => [
    f.fieldId,
    f.value,
  ])
);
check(
  'an already-clean "Amazon · March 2025" round-trips unchanged',
  alreadyClean.get('purchaseInfo') === 'Amazon · March 2025',
  `got: ${alreadyClean.get('purchaseInfo')}`
);
const official = new Map(
  validateLlmFields({ purchaseInfo: 'the ecovacs website · ~1 year ago' }).map(
    (f) => [f.fieldId, f.value]
  )
);
check(
  '"the ecovacs website · ~1 year ago" → "Ecovacs official store · 1 year ago"',
  official.get('purchaseInfo') === 'Ecovacs official store · 1 year ago',
  `got: ${official.get('purchaseInfo')}`
);
const unknown = new Map(
  validateLlmFields({ purchaseInfo: 'a local vacuum shop · 2024' }).map((f) => [
    f.fieldId,
    f.value,
  ])
);
check(
  'an unknown channel passes through untouched',
  unknown.get('purchaseInfo') === 'a local vacuum shop · 2024',
  `got: ${unknown.get('purchaseInfo')}`
);

console.log(`\n${passed + failed} checks · ${passed} passed · ${failed} failed`);
if (failed > 0) {
  console.error('\nFAILURES PRESENT');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
