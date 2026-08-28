/**
 * Regression test — parts-order / accessory request call (run: npx tsx
 * scripts/test-parser-parts-order.ts).
 *
 * Field-test transcript: a legacy DEEBOT owner whose DUST BOX got misplaced
 * calls in wanting to ORDER a replacement part. The customer describes the
 * part in vernacular ("the container that picks up the dirt", "the one
 * that catches the dirt") before the agent names it ("the dust box"),
 * spells the model out letter-by-letter through ASR garble ("D as in DOG
 * and as in NAMC 622. 622. Dash... three nine"), and the diarization is
 * scrambled — several AGENT lines are tagged Customer.
 *
 * Reported symptom on the deployed build: the note froze at
 *   Name:       Rosalynn Sterling
 *   Issue type: "New machines"
 * …with an EMPTY issue description — the parts-order request never made it
 * onto the form, because the parser only looked for MALFUNCTION complaints.
 *
 * This script verifies the fix against that transcript:
 *
 *   1. extractFields() — the request itself ("is there a way that I could
 *      get that part ordered") and the misplaced-part complaint ("it just
 *      got misplaced") are lifted as issue clauses; the issue type
 *      classifies as an accessory purchase, not "New machines";
 *   2. buildPromptWindow() — the request phrasing reaches the model, and
 *      the punctuation-only ">>" leftover of ">> [INAUDIBLE]" is noise;
 *   3. buildParsePrompt() — the system prompt now frames the issue
 *      description as "reason for calling — a malfunction OR a request
 *      (order/replace a part…)" with an accessory example;
 *   4. validateLlmFields() — the legacy free-text model "DN622.39" (not on
 *      the fleet list) survives, and the accessory issue type
 *      canonicalizes.
 */

import {
  extractFields,
  type TranscriptEntry,
} from '../src/lib/field-extraction';
import {
  buildPromptWindow,
  buildParsePrompt,
  validateLlmFields,
} from '../src/lib/llm-parser';

// --- the field-test transcript, speaker-tagged exactly as diarized --------
// (several real agent turns are labeled Customer — kept verbatim; the
// parser must survive scrambled diarization)
const RAW = String.raw`
Customer | Yes, I was calling. I have one of your remote vacuum. And for some reason, my.
Customer | How did it link catcher for the when you're doing. Vacuumy. I've got this place. Is there a way that I could get that part ordered? Sure, I mean.
Customer | which exact part are you talking about? The one that catches the dirt. It slides into just on the side of it. Are you mean the side brushes? Not the brushes. I have brushes. I'm talking
Agent | (mumbles)
Customer | about the container that picks up the dirt. I mean the dust box. The whole. The box. Okay. Is it damaged? No, it just got misplaced. Oh, oh, really?
Customer | So you mean the dust box that goes into the top of the machine ray? Yeah, it's wide under the bottom. Can I know the exact bottom of your robot?
Customer | Let's see where would I find a model number? Oh, the model number is D as in DOG and as in NAMC 622. 622.
Customer | Dash, I mean, period three months, whatever that means. Three nine. Okay. Is there a marketing name after the debought for this one? I mean, you also on the... Robotics. EVACs,
Agent | >> [INAUDIBLE]
Customer | You go back to robotics, right? Yes. Okay. And this should be one of our odor models, right? Yeah, probably. Yeah, but I've had it for a while. I got you. And can I also have your name, please?
Agent | Hello.
Customer | Rosalynn, R-O-S-A-L-Y-N-N. Last name is Sterling, like Sterling Silver. >> Rosalynn, right? >> Yes. >> Okay. Perfect. So you have a misplaced --
Customer | - Fastbox for your DN622.39 model at, yeah. - 31, 31. - 31 model, okay. - Yeah.
`;

const entries: TranscriptEntry[] = RAW.trim()
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const bar = line.indexOf('|');
    const speaker = line.slice(0, bar).trim().toLowerCase();
    return {
      speaker: speaker === 'agent' ? ('agent' as const) : ('customer' as const),
      text: line.slice(bar + 1).trim(),
    };
  });

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

console.log('\n=== 0. Transcript shape ===');
const totalChars = entries.reduce((n, e) => n + e.text.length, 0);
console.log(`  ${entries.length} turns · ${totalChars} chars`);
check(
  'a field-test call of this length fits entirely inside the sliding window',
  totalChars <= 10000,
  `${totalChars} chars vs 10000-char sliding window`
);

console.log('\n=== 1. Regex extraction (provisional layer) ===');
const fields = extractFields(entries);
const byId = new Map(fields.map((f) => [f.fieldId, f.value]));
console.log(
  '  extracted:',
  JSON.stringify(Object.fromEntries(byId), null, 2).replace(/\n/g, '\n    ')
);

const issue = byId.get('issueDescription') ?? '';
check(
  'issueDescription captures the parts-order REQUEST (was empty on the deployed build)',
  /get that part ordered|part ordered/i.test(issue),
  `got: ${issue.slice(0, 120)}…`
);
check(
  'issueDescription captures the misplaced-part complaint',
  /misplaced/i.test(issue),
  `got: ${issue.slice(0, 120)}…`
);
check(
  'issueDescription does NOT lift the agent clarifying question ("which exact part...")',
  !/which exact part/i.test(issue),
  `got: ${issue.slice(0, 120)}…`
);

const issueType = byId.get('issueType');
check(
  'issueType classifies as an accessory purchase (was "New machines")',
  issueType === 'Aftersale-Service inquiry::Accessory Purchase',
  `got: ${issueType}`
);
check(
  'no resolution steps are invented (the call ends before any advice)',
  !byId.has('resolutionSummary'),
  `got: ${byId.get('resolutionSummary')}`
);

console.log('\n=== 2. LLM prompt window (what the model sees) ===');
const window = buildPromptWindow(entries);
console.log(`  window: ${window.entryIndexes.length}/${entries.length} turns · ${window.chars} chars`);
check(
  'the parts-order request reaches the model',
  /get that part ordered/i.test(window.text)
);
check(
  'the misplaced-dust-box dialogue reaches the model',
  /misplaced/i.test(window.text)
);
check(
  '"[INAUDIBLE]" ASR artifacts never reach the model',
  !/\[INAUDIBLE\]/i.test(window.text)
);
check(
  'the punctuation-only ">>" leftover (from ">> [INAUDIBLE]") is noise, not an AGENT line',
  !/^AGENT: [^a-z0-9]*$/im.test(window.text)
);

console.log('\n=== 3. Parse prompt (requests are first-class issues) ===');
const { system, user } = buildParsePrompt(
  entries,
  ['customerName', 'contactNumber', 'deebotModel', 'issueDescription', 'issueType', 'resolutionSummary']
);
const sysChars = system.length;
const userChars = user.length;
const totalTokens = Math.ceil((sysChars + userChars) / 4);
console.log(`  system prompt : ${sysChars} chars (~${Math.ceil(sysChars / 4)} tokens)`);
console.log(`  user prompt   : ${userChars} chars (~${Math.ceil(userChars / 4)} tokens)`);
console.log(`  TOTAL         : ~${totalTokens} tokens vs Qwen2.5 32768-token context`);
check(
  'system prompt frames the issue description as "reason for calling — malfunction OR request"',
  /reason for calling.{0,80}request/i.test(system)
);
check(
  'system prompt names part/accessory ordering as a valid issue',
  /order\/replace a part or accessory/i.test(system)
);
check(
  'system prompt carries an accessory-purchase issue-type example',
  /Accessory Purchase/.test(system)
);
check(
  'system prompt stays minimal (the conversation owns the budget)',
  sysChars < 2200,
  `${sysChars} chars`
);
check(
  'the request itself is in the user prompt (inside the window)',
  /get that part ordered/i.test(user)
);

console.log('\n=== 4. LLM reply validation on this call ===');
// The reply a correct parse produces: the model is read back from the ASR
// garble ("D as in DOG and as in NAMC 622... three nine" = DN622.39) and
// the issue is the order request, not a malfunction.
const validated = new Map(
  validateLlmFields({
    customerName: 'Rosalynn Sterling',
    deebotModel: 'DN622.39',
    issueDescription: 'Dust box got misplaced; customer wants to order a replacement part',
    issueType: 'Aftersale-Service inquiry::Accessory Purchase',
    resolutionSummary: '',
  }).map((f) => [f.fieldId, f.value])
);
check(
  'name survives',
  validated.get('customerName') === 'Rosalynn Sterling',
  `got: ${validated.get('customerName')}`
);
check(
  'legacy free-text model "DN622.39" survives (maps to no fleet entry, kept as-is)',
  /DN622/.test(validated.get('deebotModel') ?? ''),
  `got: ${validated.get('deebotModel')}`
);
check(
  'the order-request issue description survives',
  /order a replacement|replacement part/i.test(validated.get('issueDescription') ?? ''),
  `got: ${validated.get('issueDescription')}`
);
check(
  'the accessory issue type survives canonicalization',
  validated.get('issueType') === 'Aftersale-Service inquiry::Accessory Purchase',
  `got: ${validated.get('issueType')}`
);

// A lazy LLM reply naming only the item — "Accessory Purchase" — still
// canonicalizes onto the full option instead of landing as junk.
const fuzzy = new Map(
  validateLlmFields({ issueType: 'Accessory Purchase' }).map((f) => [f.fieldId, f.value])
);
check(
  'bare "Accessory Purchase" canonicalizes to the full option',
  fuzzy.get('issueType') === 'Aftersale-Service inquiry::Accessory Purchase',
  `got: ${fuzzy.get('issueType')}`
);

// The deployed misfire: with no complaint phrasing anywhere, nothing may
// classify as "New machines" from this customer's speech.
const newMachines = validateLlmFields({ issueType: 'New machines' });
check(
  'the old "New machines" misfire is now at least a real canonical option (never invented junk)',
  newMachines.length === 0 || /^How to use::New machines$/.test(newMachines[0].value)
);

console.log(`\n${passed + failed} checks · ${passed} passed · ${failed} failed`);
if (failed > 0) {
  console.error('\nFAILURES PRESENT');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
