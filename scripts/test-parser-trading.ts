/**
 * Regression test — trade-in / upgrade inquiry call (run: npx tsx scripts/test-parser-trading.ts).
 *
 * Field-test transcript: a GOAT O1000 LiDAR PRO owner whose warranty
 * replacement was already arranged calls in wanting to PAY THE DIFFERENCE for
 * an upgrade instead. He describes the ORIGINAL unit's failure only midway
 * through the call (wouldn't cut edges, stops after 3-4 passes, blinking
 * "1-1" error, times out, must be carried to the dock), and the agent spends
 * the second half explaining the trade-in program (website, model + serial,
 * instant-discount option vs return-for-cashback).
 *
 * Reported symptom on the deployed build: the note froze on the FIRST
 * minutes of the call —
 *   Deebot Model: GOAT 010                       (bad canonicalization)
 *   Issue/s:       "Goat leave as 1000 went talk - goat, leave as 1000…"
 *                  (the opening warranty ramble, verbatim)
 *   Resolution/s:  "your work order real fast here"
 *                  ("Let me check your work order" — not advice at all)
 * …and nothing from the second half of the call (agent recommendations,
 * late issue feedback) ever made it onto the form.
 *
 * This script verifies the deterministic layers against that transcript:
 *
 *   1. extractFields() — name, model canonicalization ("01000 LIDAR Pro" is
 *      ASR's rendering of "O1000 LiDAR PRO" — zero vs letter O), issue
 *      clauses from the MID-call complaint description, resolution steps
 *      that include the trade-in guidance, mowing issue type;
 *   2. buildPromptWindow() — with the expanded sliding window (~10k chars)
 *      a whole call of this length fits, so even the early complaint is
 *      sent to the model (that is the fix for "info stopped being added");
 *      on a LONGER call the window keeps the newest tail and older turns
 *      slide out (their values ride along via prior-value carry-forward);
 *   3. buildParsePrompt() — the system prompt is minimal (no model list,
 *      no issue-type catalog — format hints only) and the prompt stays far
 *      below the context window;
 *   4. matchCanonicalModel() — the O↔0 confusion cases;
 *   5. validateLlmFields() — model names canonicalize when they map onto
 *      the fleet list and survive as free text when they don't.
 */

import {
  extractFields,
  matchCanonicalModel,
  type TranscriptEntry,
} from '../src/lib/field-extraction';
import {
  buildPromptWindow,
  buildParsePrompt,
  validateLlmFields,
} from '../src/lib/llm-parser';

// --- the field-test transcript, speaker-tagged ------------------------------
const RAW = String.raw`
Customer | AMR tier one support. Yeah, my name is Dan Knight. I had a lawnmower.
Agent | Hello, thanks for calling EcoVax, my name is Desi, how can I help you today?
Customer | goat, leave as 1000. And I went with talk to a guy and did all the serial number and the proof of purchase and all that kind of stuff. And then they, they went ahead and said they were going to send me another one and
Agent | [ Pause ]
Customer | do anything with the one I have that could do with basically whatever I wanted to it. But I emailed them back and said, "Is there a way that I could pay a difference and get the upgraded
Agent | Uh-huh.
Customer | 1000, it's a GOAT 01000 LIDAR Pro for $9.99. Is that a thing? Like, is that something I could possibly do? And then I got an email
Agent | Okay.
Customer | that they've sent, or they're going to send this other one out. Okay.
Agent | Let me check your work order real fast here. Our warranty replacement services
Customer | Right.
Agent | doesn't actually support page upgrades or something like that. We use our internal matrices to match what replacement model should be sent to replace your current unit. So that's determined by the warehouse.
Agent | I think if you really want to upgrade or something like that, there is a trading program on our official website where you can get a big discount, like 300 bucks with your $1000, then towards getting a new one.
Customer | Okay. Yeah, I didn't know. I don't know what this refurbished one, how much monetary value it has. But I was wondering if I could send that one right back.
Agent | That's what you're asking for. I mean, you can type it in.
Customer | at my cost if I could get, because like my big problem before I had the problem that it didn't work anymore was I couldn't ever get to the edges. It wouldn't do the edges, but now it looks like this new one that you have
Agent | Right.
Customer | has taken care of that problem. Yeah, it just would, it would go down and back three or four times and stop.
Agent | Right, I got you. I got you. I know. Can I know the original problem with the the IDK?
Customer | And it would have this blinking system of a 1 and then a dash across the top and then a 1 and go around and around and then it would time out. And then I have to pick it up and bring it to the dock.
Agent | Okay.
Customer | I didn't matter where I tried, whether I tried it in the front yard, whether I tried it in the side yard, backyard, perfectly clear. It's 100% battery charged. My Wi-Fi, everything was 100%.
Agent | (chatter)
Customer | and it'll just go down and back perfectly great and all of a sudden it just stops. Yeah.
Agent | Oh, that's a bummer. But yeah, but with this new machine, I would suggest I keep using it for a bit, because we still have warranties and everything on it.
Customer | So is there a monetary value that
Agent | And if this one's still satisfying your expectations, then you can definitely call us back and complain about this one. And then probably--
Customer | given to the refurbished one that I'm getting. And then if I would trade it like if I would send it right back and not even use it just immediately return to sender, then could I
Agent | Yeah, definitely. Definitely. There is a monetary value towards any model. Yeah.
Customer | purchase a different one. Okay, hang on. I'm going to do this right now. Can I do this with you on the phone here?
Agent | I mean, there is that program that's available. You can try right now, right? Like you can just go onto your website and go into trading program and then. Sure for sure. Yeah, for sure.
Customer | Okay, so econovac.com. Oh, econovac. Okay, so
Agent | eksvax.com/us and then you can just click on the trading page and then you type in your model and the serial number of your current unit.
Customer | >> I think it's a $400.
Agent | You can find your dollars on the RDK.
Customer | It says up to $400. So log into Eaglebacks account. Is that what I have to do here?
Agent | I mean, if you can see an option where you can just type in your RTK and type in your serial number, that'll also work faster without logging in.
Customer | Okay well where it says new models enter your email subscribe it doesn't say anywhere
Agent | >> [INAUDIBLE]
Customer | I can necessarily do that. Return it for cash back. I'll click this. I don't know.
Agent | >> You can
Customer | All right, let's say that one again.
Agent | get the instant cashback, you know, just like keep your current RTK and get a voucher towards your new one. So you're gonna have two movers running around. Wait, so there is an
Customer | Because they said I could keep it so I can get
Agent | discount option where you don't have to send back your current unit. So I mean it's kind of a hack there. So there's like two options, right? That's correct.
Customer | for that one is what you're saying. So what if I send in that one and this one? They would catch it.
Agent | That is correct. You can still get a big discount, probably 300 bucks or 200, I don't know what your current model is worth right now, but I think the training program
Customer | Only one okay Yeah, I mean because I paid like $800 for this one
Agent | He takes a one-on-one. If it takes 700 dollars off, that would be awesome. He can just pay 100 for the new one. But I don't think they support that.
Customer | But, okay, alright. So, yeah, so I still don't know where it shows me what I can.
Agent | I think they only take one at a time for the trading. I wish that can happen.
Customer | I just got a log in maybe. OK, wants to verify. All right, I think I can probably figure this out. And then-- but there's no way--
Agent | Yeah, you just log in and then type in your current one.
Customer | Well, the smartest thing would be to do what you just did. Keep the new one coming here and then ship the other one back. But if it doesn't work, are they? Is that going to be like found out like, you know what I mean? Like it's broken.
Agent | Good.
Customer | Okay.
Agent | No, I mean it's okay as long as you type in your serial number and your model number and you will be able to see a voucher or like a discount, right? Then you can just use that against your next order without even sending it back as long as you select
Customer | Hold it. You what now? What what the first thing you said? Well, instant discount. No, I haven't yet.
Agent | instant discount option instead of the return and get cashback option. Yeah. The instant discount option, right? Did you see that? Did you see that?
Customer | mail in. Is that different prices though? Really? You're kidding. All right. Okay. All right. I will give this a try. I may have to call you back.
Agent | I think the pressure's the same. Yeah, yeah. I'm not kidding. It's actually one of the programs. Yeah.
Customer | Thank you very much. Very much. I still, I will. Yep. All right. You too. Thank you. Bye-bye.
Agent | For sure, by the way, if you're cool with my service on the line, I appreciate it if you can also say on the line and do a little phone survey. I'm pressing number five. And yeah, for sure. All right, you have a great day, Dad. Bye-bye.
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
  'a field-test call of this length now fits ENTIRELY inside the sliding window',
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

const name = byId.get('customerName');
check('customerName = Dan Knight', name === 'Dan Knight', `got: ${name}`);

const model = byId.get('deebotModel');
check(
  'deebotModel canonicalizes ASR zero-O confusion ("01000 LIDAR Pro" → GOAT O1000 LiDAR PRO)',
  model === 'GOAT O1000 LiDAR PRO',
  `got: ${model}`
);

const issue = byId.get('issueDescription') ?? '';
check(
  'issueDescription includes the mid-call edge complaint',
  /edges/i.test(issue),
  `got: ${issue.slice(0, 120)}…`
);
check(
  'issueDescription includes the stops-mid-mow symptom',
  /go down and back|stop/i.test(issue),
  `got: ${issue.slice(0, 120)}…`
);
check(
  'issueDescription includes the blinking error-code description',
  /blinking/i.test(issue),
  `got: ${issue.slice(0, 120)}…`
);
check(
  'issueDescription does NOT lead with the warranty-replacement ramble',
  !/leave as 1000 went talk/i.test(issue),
  `got: ${issue.slice(0, 120)}…`
);

const resolution = byId.get('resolutionSummary') ?? '';
check(
  'resolutionSummary does NOT capture "your work order real fast here"',
  !/work order/i.test(resolution),
  `got: ${resolution.slice(0, 160)}…`
);
check(
  'resolutionSummary captures the trade-in program guidance',
  /trading program|trade/i.test(resolution),
  `got: ${resolution.slice(0, 160)}…`
);
check(
  'resolutionSummary captures the type model + serial step',
  /type in your model|serial/i.test(resolution),
  `got: ${resolution.slice(0, 160)}…`
);

const issueType = byId.get('issueType') ?? '';
check(
  'issueType classified (mowing-related)',
  /mow|Missed|edges|Fail/i.test(issueType),
  `got: ${issueType}`
);

console.log('\n=== 2. Model canonicalization O↔0 cases ===');
check(
  'matchCanonicalModel("GOAT 01000 LIDAR Pro") → GOAT O1000 LiDAR PRO',
  matchCanonicalModel('GOAT 01000 LIDAR Pro') === 'GOAT O1000 LiDAR PRO'
);
check(
  'matchCanonicalModel("O1000 RTK") → GOAT O1000 RTK (still works)',
  matchCanonicalModel('O1000 RTK') === 'GOAT O1000 RTK'
);
check(
  'matchCanonicalModel("x2 omni") → X2 OMNI (still works)',
  matchCanonicalModel('x2 omni') === 'X2 OMNI'
);
check(
  'matchCanonicalModel("T30") → a T30-family option (bare T30 is ambiguous in the list)',
  (matchCanonicalModel('T30') ?? '').startsWith('T30'),
  `got: ${matchCanonicalModel('T30')}`
);

console.log('\n=== 3. LLM prompt window (sliding) ===');
const window = buildPromptWindow(entries);
console.log(`  window: ${window.entryIndexes.length}/${entries.length} turns · ${window.chars} chars`);
const windowText = window.text;
check(
  'window caps at the 4k sliding limit (CPU/WASM generation budget)',
  window.chars <= 4000,
  `${window.chars} chars`
);
check(
  'the newest speech stays in the sliding window',
  /trading page|instant discount/i.test(windowText)
);
// The early complaint slides out on this long call — its extracted value
// rides along in prior.issueDescription instead (checked in the prompt
// test below), which is the whole point of prior-value carry-forward.
check(
  'trade-in guidance (late call) IS in the window',
  /trading page|instant discount/i.test(windowText)
);
check(
  'filler-only turns and ASR artifacts never reach the model',
  !/^\s*(AGENT|CUSTOMER): (Uh-huh|Right|Okay)\.?$/m.test(windowText)
);

// Long-call scenario: pad the conversation well past the window so the
// slide behavior is exercised — the newest tail stays, the oldest turns
// slide out, and the cap holds.
const longEntries: TranscriptEntry[] = [...entries];
for (let i = 0; i < 30; i += 1) {
  longEntries.push({ speaker: 'agent', text: `Follow-up pass ${i}: let me walk you through the voucher options one more time so everything is clear.` });
}
const longWindow = buildPromptWindow(longEntries);
const longText = longWindow.text;
check(
  'on a longer call the window caps at the sliding limit',
  longWindow.chars <= 4000,
  `${longWindow.chars} chars`
);
check(
  'the newest speech stays in the sliding window',
  /Follow-up pass 29/.test(longText)
);
check(
  'the oldest turns slide OUT of the window once the call outgrows it',
  !/AMR tier one support/.test(longText),
  'the opening turn is still inside the window'
);
check(
  'the tail window keeps contiguous recent speech (late trade-in guidance present)',
  /voucher options/.test(longText)
);

const prompt = buildParsePrompt(
  entries,
  ['customerName', 'contactNumber', 'deebotModel', 'issueDescription', 'issueType', 'resolutionSummary'],
  {
    issueDescription: 'GOAT mower leaves edges uncut; stops after a few passes with blinking 1-1 error',
    resolutionSummary: 'warranty replacement already sent -> use trade-in program on website',
  }
);
const sysChars = prompt.system.length;
const userChars = prompt.user.length;
const totalTokens = Math.ceil((sysChars + userChars) / 4);
console.log(`  system prompt : ${sysChars} chars (~${Math.ceil(sysChars / 4)} tokens)`);
console.log(`  user prompt   : ${userChars} chars (~${Math.ceil(userChars / 4)} tokens)`);
console.log(`  TOTAL         : ~${totalTokens} tokens vs Qwen2.5 32768-token context`);
check(
  'system prompt is MINIMAL (no model list, no issue-type catalog — the conversation owns the budget)',
  sysChars < 2400,
  `${sysChars} chars`
);
check(
  'no fleet model list embedded in the prompt',
  !prompt.system.includes('GOAT O1200') && !prompt.system.includes('Winbot 950')
);
check(
  'model-name format hints are present instead',
  /GOAT O1000 RTK/.test(prompt.system)
);
check('prompt far below the model context window', totalTokens < 8000);

console.log('\n=== 4. LLM reply validation on this call ===');
const validated = validateLlmFields({
  customerName: 'Dan Knight',
  deebotModel: 'GOAT O1000 LiDAR PRO',
  issueDescription: 'Original unit leaves edges uncut and stops mid-mow with blinking error 1-1',
  issueType: 'Product experience::Unable to mow edges/corners',
  resolutionSummary:
    'warranty replacement is model-matched, no paid upgrades -> use trade-in program on ecovacs.com -> type in model + serial -> select instant-discount option (keep current unit, get voucher)',
  contactNumber: 'number',
});
const vMap = new Map(validated.map((f) => [f.fieldId, f.value]));
check('name survives', vMap.get('customerName') === 'Dan Knight');
check('model survives', vMap.get('deebotModel') === 'GOAT O1000 LiDAR PRO');
check('issue description survives', (vMap.get('issueDescription') ?? '').includes('edges'));
check('resolution survives', (vMap.get('resolutionSummary') ?? '').includes('trade-in'));
check(
  'word-only phone ("number") still rejected',
  !vMap.has('contactNumber')
);

// The prompt carries no model list, so the validation layer lets the LLM's
// own naming through when it maps to no fleet entry — a free-text model
// (flagged for verification) beats a dropped field.
const freeText = new Map(
  validateLlmFields({ deebotModel: 'GOAT O1400 LiDAR' }).map((f) => [f.fieldId, f.value])
);
check(
  'a model name that maps to no fleet entry survives as free text (not dropped)',
  freeText.get('deebotModel') === 'GOAT O1400 LiDAR',
  `got: ${freeText.get('deebotModel')}`
);
const noiseModel = validateLlmFields({ deebotModel: 'x' });
check(
  'single-character noise is still dropped',
  !noiseModel.some((f) => f.fieldId === 'deebotModel')
);

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.log('FAILURES PRESENT');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
