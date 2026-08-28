/**
 * Regression test — paraphrase stage + auto-fill merge semantics
 * (run: npx tsx scripts/test-paraphrase-merge.ts).
 *
 * The paraphrase pipeline has three deterministic pieces this file pins down:
 *
 *   1. buildParaphrasePrompt() — the prompt carries the VERBATIM fragments
 *      (so the model sees exactly what the regex engine lifted) and stays
 *      tiny enough for an ultra-small local model;
 *   2. validateParaphraseReply() — only the two free-text keys are honored,
 *      blank/garbage replies fall through (verbatim fill stands), values are
 *      whitespace-collapsed and capped;
 *   3. mergeAutoFill() — the layering that answers the "always keep
 *      appending new info" requirement:
 *        - regex only fills EMPTY boxes (never disturbs existing text);
 *        - regex-grow/paraphrase REPLACE the evolving machine text (that is
 *          the boxes growing as new info is talked about) but never touch
 *          human-typed or main-LLM text;
 *        - the LLM parse supersedes provisional text and appends to (never
 *          overwrites) what the agent typed by hand.
 */

import { mergeAutoFill } from '../src/lib/autofill-merge';
import {
  buildParaphrasePrompt,
  validateParaphraseReply,
} from '../src/lib/llm-parser';

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

const VERBATIM_ISSUE =
  "it just would, it would go down and back three or four times and stop; have this blinking system of a 1 and then a dash across the top and then a 1 and go around and around and then it would time out; I couldn't ever get to the edges";
const VERBATIM_RESOLUTION =
  "there is a trading program on our official website where you can get a big discount -> you can just go onto your website and go into trading program -> you type in your model and the serial number of your current unit";

console.log('\n=== 1. buildParaphrasePrompt ===');
const p = buildParaphrasePrompt({
  issueDescription: VERBATIM_ISSUE,
  resolutionSummary: VERBATIM_RESOLUTION,
});
check('system prompt sets the support-ticket note style', /support-ticket note/.test(p.system));
check(
  'system prompt forbids inventing facts',
  /NEVER invent/.test(p.system)
);
check(
  'system prompt keeps every resolution step ("NEVER drop a step")',
  /NEVER drop a step/.test(p.system)
);
check(
  'user prompt carries the verbatim issue fragments unchanged',
  p.user.includes("it just would, it would go down and back three or four times and stop")
);
check(
  'user prompt carries the verbatim resolution fragments unchanged',
  p.user.includes('there is a trading program on our official website')
);
check('user prompt ends with the reply instruction', /Reply with the JSON object now\./.test(p.user));
const promptTokens = Math.ceil((p.system.length + p.user.length) / 4);
console.log(`  prompt size: ~${promptTokens} tokens`);
check('paraphrase prompt stays tiny (small-model budget)', promptTokens < 700);

const emptyP = buildParaphrasePrompt({});
check('empty input still produces a well-formed prompt', /issueDescription fragments: ""/.test(emptyP.user));

console.log('\n=== 2. validateParaphraseReply ===');
const ok = validateParaphraseReply({
  issueDescription:
    'Mower   stops after a few passes, shows a\nrepeating 1-1 error and times out',
  resolutionSummary:
    'Use trade-in program on ecovacs.com -> type in model and serial -> select instant-discount option',
  customerName: 'Dan Knight', // must be ignored: not a paraphrase field
  deebotModel: 'GOAT O1000', // must be ignored: not a paraphrase field
});
const okMap = new Map(ok.map((f) => [f.fieldId, f.value]));
check(
  'whitespace collapsed (newlines -> single spaces)',
  (okMap.get('issueDescription') ?? '').includes('passes, shows a repeating')
);
check('resolution survives validation', (okMap.get('resolutionSummary') ?? '').includes('trade-in'));
check(
  'non-paraphrase keys are ignored',
  !okMap.has('customerName') && !okMap.has('deebotModel')
);
check(
  'blank strings are dropped (verbatim fill stands)',
  validateParaphraseReply({ issueDescription: '   ', resolutionSummary: '' }).length === 0
);
check(
  'non-string values are ignored',
  validateParaphraseReply({ issueDescription: 42, resolutionSummary: true }).length === 0
);
check(
  'missing keys are ignored',
  validateParaphraseReply({}).length === 0
);
const capped = validateParaphraseReply({
  issueDescription: 'x'.repeat(1999),
})[0];
check(
  'issueDescription capped at 1000 chars (recall-first: every clause in, human trims later)',
  !!capped && capped.value.length === 1000
);
const cappedRes = validateParaphraseReply({
  resolutionSummary: 'y'.repeat(999),
})[0];
check(
  'resolutionSummary capped at 600 chars',
  !!cappedRes && cappedRes.value.length === 600
);

console.log('\n=== 3. mergeAutoFill — the layering semantics ===');

// 3a. REGEX only fills empty boxes
check(
  'regex fills an EMPTY field',
  mergeAutoFill('', undefined, '', 'fills me', 'regex').next === 'fills me'
);
check(
  'regex never disturbs existing text (even regex-authored text)',
  mergeAutoFill('already here', 'regex', '', 'new match', 'regex').next === 'already here'
);

// 3b. REGEX-GROW replaces the evolving machine text (the boxes GROW)
check(
  'regex-grow REPLACES prior regex text — the box grows with new info',
  mergeAutoFill('edge clause', 'regex', '', 'edge clause -> stops mid-mow', 'regex-grow').next ===
    'edge clause -> stops mid-mow'
);
check(
  'regex-grow replaces prior regex-grow text (repeated growth)',
  mergeAutoFill('a -> b', 'regex-grow', '', 'a -> b -> c', 'regex-grow').next === 'a -> b -> c'
);
check(
  'regex-grow never touches human-typed text',
  mergeAutoFill('human text', undefined, '', 'machine text', 'regex-grow').next === 'human text'
);
check(
  'regex-grow never touches main-LLM text',
  mergeAutoFill('llm text', 'llm', '', 'machine text', 'regex-grow').next === 'llm text'
);

// 3c. PARAPHRASE replaces its own evolving lineage
check(
  'paraphrase REPLACES prior regex text (polish supersedes verbatim)',
  mergeAutoFill('uh it would go down and back and stop', 'regex', '', 'Mower stops after a few passes', 'paraphrase').next ===
    'Mower stops after a few passes'
);
check(
  'paraphrase replaces prior paraphrase text (re-polish as fragments grow)',
  mergeAutoFill('Mower stops', 'paraphrase', '', 'Mower stops after a few passes with 1-1 error', 'paraphrase').next ===
    'Mower stops after a few passes with 1-1 error'
);
check(
  'paraphrase never touches human-typed text',
  mergeAutoFill('human text', undefined, '', 'polished', 'paraphrase').next === 'human text'
);

// 3d. The main LLM parse is authoritative
check(
  'llm fills an empty field and records an empty base',
  mergeAutoFill('', undefined, '', 'llm value', 'llm').next === 'llm value'
);
check(
  'llm REPLACES its own prior value (no pile-up on re-parse)',
  mergeAutoFill('llm old', 'llm', '', 'llm new', 'llm').next === 'llm new'
);
check(
  'llm replaces its prior value keeping the human base in front',
  mergeAutoFill('human base -> llm old', 'llm', 'human base', 'llm new', 'llm').next ===
    'human base -> llm new'
);
check(
  'llm supersedes provisional regex text',
  mergeAutoFill('verbatim clause', 'regex', '', 'llm condensed', 'llm').next === 'llm condensed'
);
check(
  'llm supersedes paraphrased text',
  mergeAutoFill('polished text', 'paraphrase', '', 'llm condensed', 'llm').next === 'llm condensed'
);
check(
  'llm APPENDS to human-typed text (never overwrites)',
  mergeAutoFill('human', undefined, '', 'llm value', 'llm').next === 'human -> llm value'
);
check(
  'append reuses an existing trailing arrow',
  mergeAutoFill('human ->', undefined, '', 'llm value', 'llm').next === 'human -> llm value'
);

// 3e. End-to-end growth sequence over a (simulated) long call
console.log('  --- simulated live call sequence ---');
let field = '';
let prior: 'regex' | 'regex-grow' | 'paraphrase' | 'llm' | undefined;
let base = '';
const steps: Array<{ src: 'regex' | 'regex-grow' | 'paraphrase' | 'llm'; value: string; note: string }> = [
  { src: 'regex', value: 'it just would, it would go down and back three or four times and stop', note: 'first clause lifts (empty box)' },
  { src: 'regex-grow', value: 'it just would, it would go down and back three or four times and stop -> blinking system of a 1 and then a dash', note: 'error-code clause talked about later' },
  { src: 'paraphrase', value: 'Mower stops after a few passes with a repeating 1-1 error, then times out', note: 'paraphrase polishes the fragments' },
  { src: 'regex-grow', value: 'Mower stops after a few passes with a repeating 1-1 error, then times out -> never finished the edges', note: 'edge complaint surfaces after the polish' },
  { src: 'llm', value: 'GOAT mower stops mid-mow with repeating 1-1 error and times out; leaves edges uncut', note: 'main LLM parse is authoritative' },
];
for (const step of steps) {
  const plan = mergeAutoFill(field, prior, base, step.value, step.src);
  field = plan.next;
  if (plan.base !== null) base = plan.base;
  prior = step.src;
  console.log(`    [${step.src.padEnd(11)}] ${step.note}`);
  console.log(`      → "${field.slice(0, 80)}${field.length > 80 ? '…' : ''}"`);
}
check(
  'final text is the authoritative LLM parse',
  field === 'GOAT mower stops mid-mow with repeating 1-1 error and times out; leaves edges uncut'
);
check(
  'human-typed text survives the whole sequence (no step lost it)',
  (() => {
    // Mirrors the page semantics exactly: a fill that does NOT change the
    // text is rejected by the guards and must not mark the field machine-
    // authored — otherwise a later regex-grow could steal the human's text.
    let f = 'agent typed';
    let pr: 'regex' | 'regex-grow' | 'paraphrase' | 'llm' | undefined = undefined;
    let b = '';
    for (const step of steps) {
      const rejected =
        (step.src === 'regex' && f.length > 0) ||
        ((step.src === 'regex-grow' || step.src === 'paraphrase') &&
          f.length > 0 &&
          !(pr === 'regex' || pr === 'regex-grow' || pr === 'paraphrase'));
      if (rejected) continue; // guard returns early; marker untouched
      const plan = mergeAutoFill(f, pr, b, step.value, step.src);
      f = plan.next;
      if (plan.base !== null) b = plan.base;
      pr = step.src === 'regex-grow' ? 'regex' : step.src;
    }
    return f === 'agent typed -> GOAT mower stops mid-mow with repeating 1-1 error and times out; leaves edges uncut';
  })()
);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.log('FAILURES PRESENT');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
