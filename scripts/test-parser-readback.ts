/**
 * Regression test — read-back style support call (run: npx tsx scripts/test-parser-readback.ts).
 *
 * Field-test transcript where the AGENT reads every detail back for
 * confirmation and the customer only back-channels ("you"). Reported
 * symptom: phone number landed in the box (as the whole phrase "your
 * phone number is 310-173-4037"!) while name, issue type, issue
 * description and resolution were all missed.
 *
 * Verifies the deterministic layers of the pipeline against that exact
 * transcript:
 *
 *   1. extractFields() — speaker-aware regex fills every field the LLM
 *      would have missed (the provisional backstop when the model is
 *      downloading, disabled, or produces a broken reply);
 *   2. buildPromptWindow() — the "you" filler turns and [ Pause ] artifacts
 *      never reach the model, the real content does;
 *   3. buildParsePrompt() — prompt size measurement (answers "is this a
 *      context-size issue?" with numbers, not guesses);
 *   4. validateLlmFields() — a bare "O1000 RTK" model answer canonicalizes
 *      to GOAT O1000 RTK instead of being rejected.
 *
 * Also writes the exact (system, user) prompt to /tmp so the live-model
 * check (scripts/test-llm-readback.mjs) replays the identical prompt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  extractFields,
  matchCanonicalModel,
  type TranscriptEntry,
} from '../src/lib/field-extraction';
import {
  buildParsePrompt,
  buildPromptWindow,
  validateLlmFields,
  type LlmFieldId,
} from '../src/lib/llm-parser';

// ---------------------------------------------------------------------------
// The field-test transcript, verbatim
// ---------------------------------------------------------------------------
const TRANSCRIPT: TranscriptEntry[] = [
  { speaker: 'agent', text: 'And your name is Rodrik is.' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'Dominique, right? Great. And your phone number is 310-173-4037, right?' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'great and you have a O1000 RTK right great' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'This work.' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'And the main issue you have is a diem battery, right?' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: '[ Pause ]' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'You purchased this machine from Amazon one year ago.' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'Correct? Correct.' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'And the main issue with your O1000 RTK model is that it cannot mow some areas, right?' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'Thank you for confirming that. So my resolution will be you reset the machine and you restart the' },
  { speaker: 'customer', text: 'you' },
  { speaker: 'agent', text: 'and you put it back into the base station to charge it and see how it behaves.' },
  { speaker: 'customer', text: 'you' },
];

const ALL_FIELDS: LlmFieldId[] = [
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
];

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------
let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail?: string): void {
  checks += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const show = (v: string | undefined) => (v === undefined ? '(missing)' : `"${v}"`);

function main(): void {
  console.log('\n=== 1. Regex extraction (provisional backstop) ===');
  const fields = extractFields(TRANSCRIPT);
  const byId = new Map(fields.map((f) => [f.fieldId, f.value]));

  console.log('  extracted:', JSON.stringify(Object.fromEntries(byId), null, 2).replace(/\n/g, '\n  '));

  // Name: agent read-back "your name is Rodrik" (or the correction
  // "Dominique, right?") — was completely missed in the field test.
  check(
    'customerName parsed from the agent read-back',
    /rodrik|dominique/i.test(byId.get('customerName') ?? ''),
    show(byId.get('customerName'))
  );

  // Phone: just the digits, NOT the whole phrase.
  check(
    'contactNumber is digits only (not the whole spoken phrase)',
    (byId.get('contactNumber') ?? '').replace(/\D/g, '') === '3101734037' &&
      !/phone/i.test(byId.get('contactNumber') ?? ''),
    show(byId.get('contactNumber'))
  );

  // Model: "O1000 RTK" spoken without the GOAT brand canonicalizes.
  check(
    'deebotModel canonicalizes to GOAT O1000 RTK',
    byId.get('deebotModel') === 'GOAT O1000 RTK',
    show(byId.get('deebotModel'))
  );

  check(
    'purchaseInfo captured (channel + timeframe)',
    /amazon/i.test(byId.get('purchaseInfo') ?? ''),
    show(byId.get('purchaseInfo'))
  );

  check(
    'issueDescription summarizes the complaint',
    /mow|battery/i.test(byId.get('issueDescription') ?? ''),
    show(byId.get('issueDescription'))
  );

  check(
    'issueType classified (mowing/battery related)',
    /mow|battery|operating time/i.test(byId.get('issueType') ?? ''),
    show(byId.get('issueType'))
  );

  check(
    'resolutionSummary captured the agent TBS steps',
    /reset/i.test(byId.get('resolutionSummary') ?? '') &&
      /base station/i.test(byId.get('resolutionSummary') ?? ''),
    show(byId.get('resolutionSummary'))
  );

  console.log('\n=== 2. LLM prompt window (what the model sees) ===');
  const window = buildPromptWindow(TRANSCRIPT);
  console.log('  window text:\n' + window.text.replace(/^/gm, '    '));

  check(
    'filler "you" turns excluded from the prompt',
    !/^CUSTOMER: you$/m.test(window.text),
  );
  check(
    '[ Pause ] ASR artifact excluded from the prompt',
    !/pause/i.test(window.text),
  );
  check(
    'every real agent line made the window (11 agent turns, "[ Pause ]" is an artifact)',
    window.entryIndexes.filter((i) => TRANSCRIPT[i].speaker === 'agent').length === 10,
    `${window.entryIndexes.length} entries in window`
  );
  check(
    'window well under the transcript cap (no truncation)',
    window.chars <= 3000,
    `${window.chars} chars`
  );

  console.log('\n=== 3. Prompt size (context-size question, measured) ===');
  const { system, user } = buildParsePrompt(TRANSCRIPT, ALL_FIELDS);
  const total = system.length + user.length;
  const estTokens = Math.ceil(total / 4);
  console.log(`  system prompt : ${system.length} chars (~${Math.ceil(system.length / 4)} tokens)`);
  console.log(`  user prompt   : ${user.length} chars (~${Math.ceil(user.length / 4)} tokens)`);
  console.log(`  TOTAL         : ${total} chars (~${estTokens} tokens)`);
  console.log('  Qwen2.5 context window: 32768 tokens');
  check(
    'prompt far below the model context window (not a context-size failure)',
    estTokens < 4000,
    `${estTokens} tokens`
  );

  console.log('\n=== 4. LLM reply validation ===');
  const validated = validateLlmFields({
    deebotModel: 'O1000 RTK',
    contactNumber: 'number',
    customerName: 'Dominique',
    issueType: 'cannot mow some areas',
  });
  const vById = new Map(validated.map((f) => [f.fieldId, f.value]));
  check(
    'bare "O1000 RTK" model answer canonicalizes instead of being dropped',
    vById.get('deebotModel') === 'GOAT O1000 RTK',
    show(vById.get('deebotModel'))
  );
  check(
    'word-only phone answer ("number") rejected',
    !vById.has('contactNumber'),
    show(vById.get('contactNumber'))
  );
  check(
    'free-text issueType mapped to a canonical option',
    /::/.test(vById.get('issueType') ?? ''),
    show(vById.get('issueType'))
  );

  // Direct canonicalization sanity: suffix match for brand-less GOAT tokens
  check(
    'matchCanonicalModel("O1000 RTK") → GOAT O1000 RTK',
    matchCanonicalModel('O1000 RTK') === 'GOAT O1000 RTK',
    String(matchCanonicalModel('O1000 RTK'))
  );
  check(
    'matchCanonicalModel("x2 omni") still → X2 OMNI',
    matchCanonicalModel('x2 omni') === 'X2 OMNI',
    String(matchCanonicalModel('x2 omni'))
  );

  // Persist the exact prompt for the live-model replay test
  const outDir = '/data/user/work';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    `${outDir}/llm-readback-prompt.json`,
    JSON.stringify({ system, user, windowText: window.text }, null, 2)
  );
  console.log(`\n  prompt written to ${outDir}/llm-readback-prompt.json`);

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s)`);
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}

main();
