#!/usr/bin/env node
/**
 * schedule-nov-roster.mjs — the November 2026 roster auto-scheduling workflow.
 *
 * Pipeline (rule 10 of the Nov brief):
 *   1. Pull the OCT sheet (source of default shift preferences per agent).
 *   2. Pull the 许愿池 "11月" sheet (wishes: preferred families, rest days,
 *      leaves) — parsed into structured overrides (raw text preserved).
 *   3. Derive each agent's default: dominant Oct shift family + rest-weekday
 *      pattern, remapped +1h for US winter time (DST ends Sun 2026-11-01,
 *      so the whole month runs EST codes: A21→A22, A22→A23, A23→A00,
 *      A00→A01, A06→A07; A21 itself is cancelled from the switch date).
 *   4. Run the constraint solver (see RULES below) and write:
 *        src/data/roster-2026-11.ts  (agents + shifts + DAY_TOTALS_202611)
 *        src/data/roster-2026-10.ts  (refreshed with DAY_TOTALS_202610)
 *
 * RULES (Nov 2026, post-DST codes):
 *   • CHAT  weekdays: A22 ≥3 (ideal 4) · A01 ≥2 (ideal 3) · A23 filler →
 *     day total 5–7. Weekends: A22 ≥3 · A01 ≥2.
 *   • CALL   weekdays: A22 ≥8 · A23 ≥2 · A01 ≥4 (target 5) · A00 filler
 *     +1–2 · total ≥15. Weekends: A22 ≥8 · A23 0–2 · A01 ≥4 (target 5) ·
 *     A00 filler 0–1 · total ≥14.
 *   • Management: ≥1 TL + ≥1 T2 every day; Mondays need 2 TL. OM/SV (Hoi)
 *     = Mon–Fri A01 (Oct A00 remapped +1). FR Call (Jing) = Mon–Fri A22
 *     (user rule: "always mon-fri A21 (A22 EST)"). DTC reuses the Oct
 *     day-pattern (remapped). Maggie departed → Farewell.
 *   • Everyone defaults to 20–21 shifts (hard cap 22 when minimums demand).
 *   • Max 6 consecutive workdays; wishes honored where they don't break a
 *     hard constraint; rest requests inside the Black-Friday window
 *     (Nov 16–30) are flagged.
 *
 * Reuse: the month, wish parse and RULES blocks are data — copy this file
 * for future months and adjust them; the engine stays the same.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'src', 'data');

const ROSTER_WIKI = 'https://lmgx8md8u1.feishu.cn/wiki/QtV3wEQqOiWSe2kyqLMcxu3knvd';
const WISHES_WIKI = 'https://lmgx8md8u1.feishu.cn/wiki/FMm1w5cQ8i7rL1kVCtCcUGsbn3c';
const OCT_SHEET = 'WaX7DS';
const NOV_SHEET = 'UMydVL';
const WISHES_SHEET = 'X3YfRJ';

/* ------------------------------- the month -------------------------------- */

const YEAR = 2026;
const MONTH = 11; // November
const DAYS = new Date(YEAR, MONTH, 0).getDate(); // 30
/** US DST ends Sun 2026-11-01 → the whole month runs EST (+1h) codes. */
const DST_SWITCH_ISO = '2026-11-01';
/** Nov codes: A22 (ex-A21) · A23 (ex-A22) · A00 (ex-A23) · A01 (ex-A00). */
const REMAP = { A21: 'A22', A22: 'A23', A23: 'A00', A00: 'A01', A06: 'A07', 'TR-A22': 'A23' };
const BLACK_FRIDAY_WINDOW = ['2026-11-16', '2026-11-30']; // 中下旬 promo
const SHIFTS_TARGET = 20.5;      // default 20–21
const SHIFTS_HARD_MAX = 22;      // only when minimums demand
const MAX_CONSECUTIVE = 6;       // never >6 workdays in a row

/** Wished 调休/事假 days land in the BF window → keep but flag. */
const flags = [];

/* ------------------------- parsed wish overrides -------------------------- */
/* Interpretation of the 许愿池 11月 free-text rows. Raw text kept for the
 * report. restDays = preferred weekday rest pair (0=Sun…6=Sat), soft.
 * family = preferred Nov shift codes (rotation may override, 急转 allowed). */

const WISHES = {
  Hoi:      { raw: 'A00/01 每周四五排调休', family: ['A01'], restDays: [4, 5] },          // Thu Fri
  Alexia:   { raw: 'A00/A01 周五周六可以休', family: ['A01'], restDays: [5, 6] },          // Fri Sat (soft — TL daily coverage)
  Harrison: { raw: '', family: ['A22'], restDays: [0, 6] },                                // Oct default Sat Sun
  Steven:   { raw: '', family: ['A22'], restDays: [0, 6] },
  Steve:    { raw: '', family: ['A22'], restDays: [0, 6] },
  George:   { raw: 'A00(01) 休周末 上PH', family: ['A01'], restDays: [0, 6] },
  Winnie:   { raw: '', family: ['A07'], restDays: [0, 6] },                                // Oct A06 day shift
  Catherine:{ raw: 'A21/22, 周日周一休息', family: ['A22'], restDays: [0, 1] },             // Sun Mon
  Dagen:    { raw: 'A21/22, 周四五休息， 11月10日或者11日要一天年假或者调休，要回家给我妈庆生吃饭', family: ['A22'], restDays: [4, 5], leave: [{ iso: '2026-11-11', code: '调休' }] },
  Catherine_chat_note: null,
  Ronald:   { raw: '23/00 但愿不急转&不用连上6天 可休一二或周日周一 11号当天生日需要休一天thanks能和休息连起来就更好了', family: ['A00', 'A23'], restDays: [1, 2], leave: [{ iso: '2026-11-11', code: '事假' }] }, // Mon Tue rest + birthday Wed
  Boris:    { raw: '00 01，休周末,能不能11.19或者20一天调休，因为我生日10.20我忘了调休了。', family: ['A01'], restDays: [0, 6], leave: [{ iso: '2026-11-20', code: '调休', flag: 'inside Black-Friday window' }] },
  Vitto:    { raw: '00/01 休周末谢谢🙏', family: ['A01'], restDays: [0, 6] },
  Lynn:     { raw: '00/01，休六日', family: ['A01'], restDays: [0, 6] },
  Jacky:    { raw: 'A23 尽量周五周六双休或周日周一双休，把剩余的两天调休也用了。希望不急转怕精神不佳。', family: ['A23'], restDays: [4, 5], leave: [{ iso: '2026-11-05', code: '调休' }, { iso: '2026-11-10', code: '调休' }] },
  TQ:       { raw: 'A22 周末双休 周末双休 周末双休', family: ['A22'], restDays: [0, 6] },
};
/** A00/A01 weekend rest is NOT prioritized (动态轮流双休) — soft only. */

/* ------------------------------ lark helpers ------------------------------ */

function lark(args) {
  const out = execFileSync('lark-cli', args, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(out);
}

function fetchCsv(wiki, sheetId, range) {
  const res = lark(['sheets', '+csv-get', '--url', wiki, '--sheet-id', sheetId, '--range', range]);
  if (!res.ok) throw new Error(`lark-cli failed for sheet ${sheetId}: ${JSON.stringify(res.error)}`);
  return res.data.annotated_csv;
}

function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseAnnotatedCsv(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\[row=\d+\]\s?(.*)$/);
    if (m) rows.push(splitCsvLine(m[1]));
  }
  return rows;
}

const iso = (d) => `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const weekday = (d) => new Date(YEAR, MONTH - 1, d).getDay(); // 0=Sun
const isWeekend = (d) => [0, 6].includes(weekday(d));
const isMonday = (d) => weekday(d) === 1;
const inBfWindow = (d) => { const x = iso(d); return x >= BLACK_FRIDAY_WINDOW[0] && x <= BLACK_FRIDAY_WINDOW[1]; };

/* ------------------------------ fetch inputs ------------------------------ */

console.log('Fetching Oct sheet, Nov agent list and Nov wishes…');
const octRows = parseAnnotatedCsv(fetchCsv(ROSTER_WIKI, OCT_SHEET, 'A1:AL56'));
const novRows = parseAnnotatedCsv(fetchCsv(ROSTER_WIKI, NOV_SHEET, 'A1:AL42'));
const wishRows = parseAnnotatedCsv(fetchCsv(WISHES_WIKI, WISHES_SHEET, 'A2:E18'));

/* Oct agents: rows with numeric 序号 (data starts sheet-row 4 = index 3). */
const octAgents = [];
for (const r of octRows) {
  const no = String(r[0] ?? '').trim();
  if (!/^\d+$/.test(no)) continue;
  const en = String(r[3] ?? '').trim();
  if (!en) continue;
  const cells = r.slice(7, 7 + 31).map((c) => String(c ?? '').trim()); // Oct days 1..31
  octAgents.push({
    no, hr: String(r[1] ?? '').trim(), zh: String(r[2] ?? '').trim(), en,
    skill: String(r[4] ?? '').trim(),
    shifts: cells, // index 0 = Oct 1
  });
}

/* Nov agents from the Nov sheet (authoritative team list, rows 3-42). */
const novAgents = [];
for (const r of novRows) {
  const no = String(r[0] ?? '').trim();
  if (!/^\d+$/.test(no)) continue;
  const en = String(r[3] ?? '').trim();
  if (!en) continue;
  novAgents.push({
    no, hr: String(r[1] ?? '').trim(), zh: String(r[2] ?? '').trim(), en,
    skill: String(r[4] ?? '').trim(),
    hired: String(r[5] ?? '').trim(), joined: String(r[6] ?? '').trim(),
  });
}

/* ------------------- derive defaults from October (rule 8) ---------------- */

function dominantFamily(octShifts) {
  const counts = {};
  for (const c of octShifts) {
    if (!c || !/^A/.test(c)) continue;
    const code = REMAP[c] ?? c;
    counts[code] = (counts[code] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.map(([code]) => code);
}

function restWeekdays(octShifts) {
  // Oct 1 2026 = Thursday(4). weekday of Oct day n:
  const counts = new Array(7).fill(0);
  octShifts.forEach((c, i) => {
    if (!c || /^(OFF|PH|AL|调休|病假|事假)$/.test(c)) {
      const wd = (4 + i) % 7; // Oct 1 = Thu
      counts[wd] += 1;
    }
  });
  // two highest-count weekdays, ties → earlier index
  const idx = counts.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return [idx[0][1], idx[1][1]];
}

const octByEn = new Map(octAgents.map((a) => [a.en, a]));

/* Agent plan: everyone gets { family[], restDays[], leave: Map<iso,code>, fixed? } */
const plan = new Map();
for (const na of novAgents) {
  const oct = octByEn.get(na.en);
  const wish = WISHES[na.en];
  const family = wish?.family ?? (oct ? dominantFamily(oct.shifts) : ['A22']);
  const restDays = wish?.restDays ?? (oct ? restWeekdays(oct.shifts) : [0, 6]);
  const leave = new Map((wish?.leave ?? []).map((l) => [l.iso, l.code]));
  plan.set(na.en, { family, restDays, leave, oct, wish, skill: na.skill });
}

/* Special user rules. */
const p = (en) => plan.get(en);
// OM/SV — Mon–Fri A01 (Oct A00, +1h EST remap; wish accepts A00/01).
p('Hoi').fixed = (d) => (weekday(d) >= 1 && weekday(d) <= 5 ? 'A01' : 'OFF');
// FR Call — always Mon–Fri A21 (A22 EST).
p('Jing').fixed = (d) => (weekday(d) >= 1 && weekday(d) <= 5 ? 'A22' : 'OFF');
// DTC — reuse the Oct day-pattern (day-number carry, remapped +1h).
p('Peter').fixed = (d) => {
  const code = p('Peter').oct?.shifts[d - 1] ?? '';
  if (!code) return 'OFF';
  if (/^(OFF|PH|AL|调休|病假|事假)$/.test(code)) return code;
  return REMAP[code] ?? code;
};
p('Maggie').fixed = (d) => (d === 1 ? 'Farewell' : ''); // departed — single marker, like Oct

/* ------------------------------ the solver -------------------------------- */

const WORK_RE = /^A/; // any A-shift counts as on-duty
const assignments = new Map(novAgents.map((a) => [a.en, new Array(DAYS).fill('')]));

const dayCount = (d, pred) => {
  let n = 0;
  for (const a of novAgents) {
    const c = assignments.get(a.en)[d - 1];
    if (c && pred(c, a)) n += 1;
  }
  return n;
};
const isChat = (a) => a.skill === 'Chat';
const isCall = (a) => a.skill === 'Call';
const codeCount = (d, code, pool) =>
  dayCount(d, (c, a) => c === code && (!pool || pool(a)));

function shiftsOf(en) { return assignments.get(en); }
function totalShifts(en) { return shiftsOf(en).filter((c) => WORK_RE.test(c)).length; }

function consecutiveWorkBefore(en, d) {
  const s = shiftsOf(en);
  let n = 0;
  for (let i = d - 1; i >= 1; i--) { if (WORK_RE.test(s[i - 1])) n += 1; else break; }
  return n;
}

/** Can this agent work day d on code? */
function available(en, d, code, needed) {
  const s = shiftsOf(en);
  if (s[d - 1]) return false;                                  // already assigned
  if (consecutiveWorkBefore(en, d) >= MAX_CONSECUTIVE) return false;
  const pl = plan.get(en);
  if (pl.leave.get(iso(d))) return false;                      // wished leave
  if (totalShifts(en) >= (needed ? SHIFTS_HARD_MAX : Math.ceil(SHIFTS_TARGET))) return false;
  // rest-day alignment: softly avoid the agent's preferred rest weekdays,
  // but allow when the pool is short (rotation / 团队运营优先).
  return true;
}

/** Greedy slot filler: pick the best agent for (day, code, pool). */
function fillSlot(d, code, pool, ideal, must) {
  let have = codeCount(d, code, pool);
  const target = (must ?? ideal ?? 0);
  while (have < target) {
    let best = null; let bestScore = -Infinity;
    for (const a of novAgents) {
      if (!pool(a)) continue;
      if (!available(a.en, d, code, true)) continue;
      const pl = plan.get(a.en);
      let score = 0;
      if (pl.family[0] === code) score += 3;
      else if (pl.family.includes(code)) score += 2;
      // behind the monthly target → prefer busier deficit
      score += (SHIFTS_TARGET - totalShifts(a.en)) * 1.2;
      // fresh (rested yesterday or 2 days ago)
      const s = shiftsOf(a.en);
      if (d >= 2 && !WORK_RE.test(s[d - 2])) score += 1.2;
      // avoid their preferred rest weekdays (soft)
      if (pl.restDays.includes(weekday(d))) score -= 2.5;
      // prefer not resting the day before/after their rest pair (keep blocks)
      if (pl.restDays.includes((weekday(d) + 1) % 7) || pl.restDays.includes((weekday(d) + 6) % 7)) score -= 0.6;
      // Monday & promo window need peak staffing → slightly prefer veterans
      if (inBfWindow(d)) score += 0.3;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    if (!best) return have; // pool exhausted
    shiftsOf(best.en)[d - 1] = code;
    have += 1;
  }
  return have;
}

console.log('Scheduling…');

/* Pass 1 — fixed patterns (management / FR / DTC). */
for (const a of novAgents) {
  const pl = plan.get(a.en);
  if (!pl.fixed) continue;
  for (let d = 1; d <= DAYS; d++) shiftsOf(a.en)[d - 1] = pl.fixed(d);
}

/* Pass 2a — balanced rest pairs (动态轮流双休). Rests spread evenly across
   weekdays within each family (团队运营优先); wished/Oct pairs win ties.
   A local-search pass then smooths the distribution. Management pools get
   explicit pairs that satisfy TL ≥1/day (Mon 2) and T2 ≥1/day. */
const PAIRS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]];

function balanceRestPairs(members, prefPairOf) {
  if (members.length === 0) return;
  const rest = new Array(7).fill(0);
  const chosen = new Map();
  const sorted = [...members].sort((a, b) => (prefPairOf(b) ? 1 : 0) - (prefPairOf(a) ? 1 : 0));
  for (const en of sorted) {
    const pref = prefPairOf(en);
    let best = PAIRS[0]; let bestScore = Infinity;
    for (const pair of PAIRS) {
      let score = rest[pair[0]] + rest[pair[1]];
      if (pref && pref[0] === pair[0] && pref[1] === pair[1]) score -= 0.5;
      if (score < bestScore) { bestScore = score; best = pair; }
    }
    chosen.set(en, best);
    rest[best[0]] += 1; rest[best[1]] += 1;
  }
  // Local search (best-improvement): repeatedly apply the single (member,
  // pair) move that most lowers the squared deviation from the even target.
  const target = (members.length * 2) / 7;
  const devOf = (arr) => arr.reduce((s, n) => s + (n - target) ** 2, 0);
  for (let iter = 0; iter < 50; iter++) {
    let bestMove = null; let bestGain = 1e-9;
    for (const en of members) {
      const cur = chosen.get(en);
      for (const pair of PAIRS) {
        if (pair[0] === cur[0] && pair[1] === cur[1]) continue;
        const next = [...rest];
        next[cur[0]] -= 1; next[cur[1]] -= 1;
        next[pair[0]] += 1; next[pair[1]] += 1;
        const gain = devOf(rest) - devOf(next);
        if (gain > bestGain) { bestGain = gain; bestMove = { en, cur, pair }; }
      }
    }
    if (!bestMove) break;
    rest[bestMove.cur[0]] -= 1; rest[bestMove.cur[1]] -= 1;
    rest[bestMove.pair[0]] += 1; rest[bestMove.pair[1]] += 1;
    chosen.set(bestMove.en, bestMove.pair);
  }
  for (const [en, pair] of chosen) plan.get(en).restDays = pair;
}

const octPair = (en) => {
  const oct = octByEn.get(en);
  return oct ? restWeekdays(oct.shifts) : null;
};

const chatMembers = novAgents.filter((a) => isChat(a)).map((a) => a.en);
const callA22Members = ['Pyro', 'Jim', 'Ruby', 'Hawks', 'Yison', 'Jason', 'Jenson', 'Kevin W', 'Tony', 'Jun', 'Henry', 'Eric'];
const callA01Members = ['Alan', 'Dezzy', 'Laura', 'Kira', 'Patrick', 'Stanley'];
const callA23Members = ['Charsan', 'Rachel', 'Trent', 'Kevin X'];

balanceRestPairs(chatMembers, (en) => WISHES[en]?.restDays ?? null);
balanceRestPairs(callA22Members, octPair);
balanceRestPairs(callA01Members, octPair);
balanceRestPairs(callA23Members, (en) => WISHES[en]?.restDays ?? octPair(en));

// Management pairs — must satisfy the daily TL/T2 minimums (see Pass 3).
plan.get('Alexia').restDays = [5, 6];   // Fri Sat (wished)
plan.get('Harrison').restDays = [2, 3]; // Tue Wed (Mon needs 2 TL + daily ≥1)
plan.get('Steven').restDays = [0, 6];   // Sat Sun
plan.get('Steve').restDays = [2, 3];    // Tue Wed
plan.get('George').restDays = [4, 5];   // Thu Fri (weekend-rest wish soft-denied)
plan.get('Catherine').restDays = [0, 1]; // Sun Mon (wished)
plan.get('Winnie').restDays = [0, 6];    // Sat Sun (Oct)

/* Pass 2b — per-day slot assignment. Working pool members (not resting,
   not on leave) fill the day's minimum slots first (family-preferred,
   rotation-fair), then ideal slots, then extras fall to their family or
   the A23/A00 filler. */
for (const a of novAgents) {
  const pl = plan.get(a.en);
  if (pl.fixed) continue;
  for (let d = 1; d <= DAYS; d++) {
    const leaveCode = pl.leave.get(iso(d));
    if (leaveCode) { shiftsOf(a.en)[d - 1] = leaveCode; continue; }
    if (pl.restDays.includes(weekday(d))) { shiftsOf(a.en)[d - 1] = 'OFF'; continue; }
    // working — code resolved below (management gets its family code)
    const mgmt = ['TL', 'T2', 'T3', 'SV'].includes(a.skill);
    shiftsOf(a.en)[d - 1] = mgmt ? pl.family[0] : '';
  }
}

for (let d = 1; d <= DAYS; d++) {
  const wknd = isWeekend(d);
  for (const poolName of ['chat', 'call']) {
    const pool = novAgents.filter((a) => poolOf(a) === poolName && shiftsOf(a.en)[d - 1] === '');
    const assigned = new Map();
    const take = (code) => {
      const cands = pool.filter((a) => !assigned.has(a.en));
      if (!cands.length) return false;
      cands.sort((x, y) => {
        const fx = plan.get(x.en).family; const fy = plan.get(y.en).family;
        const sx = fx[0] === code ? 0 : fx.includes(code) ? 1 : 2;
        const sy = fy[0] === code ? 0 : fy.includes(code) ? 1 : 2;
        return sx - sy || totalShifts(x.en) - totalShifts(y.en);
      });
      assigned.set(cands[0].en, code);
      return true;
    };
    const mins = poolName === 'chat'
      ? [['A22', 3], ['A01', 2]]
      : [['A22', 8], ['A01', 4], ['A23', wknd ? 0 : 2]];
    const ideals = poolName === 'chat'
      ? [['A22', 1], ['A01', 1]]
      : [['A01', 1], ['A00', 1], ['A23', 1]];
    for (const [code, n] of mins) for (let i = 0; i < n; i++) take(code);
    for (const [code, n] of ideals) for (let i = 0; i < n; i++) take(code);
    for (const a of pool) {
      if (assigned.has(a.en)) { shiftsOf(a.en)[d - 1] = assigned.get(a.en); continue; }
      const fam = plan.get(a.en).family.filter((c) => ['A22', 'A23', 'A00', 'A01'].includes(c));
      shiftsOf(a.en)[d - 1] = fam[0] ?? 'A23'; // extra worker → filler/family
    }
  }
}
/* Pass 3 — per-day repair for residual gaps. Ops, in priority order:
   (a) switch a working pool agent on an over-stocked code → needed code,
       never taking the source code below its own daily minimum (急转
       A01→A22 only when A01 stays ≥ its minimum);
   (b) add an OFF pool agent (consecutive & cap respected). */
const switchNotes = [];
const flipNotes = [];

function poolOf(a) {
  if (isChat(a)) return 'chat';
  if (isCall(a)) return 'call';
  if (a.skill === 'TL') return 'tl';
  if (a.skill === 'T2') return 't2';
  return null; // SV / T3 / DTC / FR are fixed or unconstrained
}

function minFor(poolName, code) {
  if (poolName === 'chat') return code === 'A22' ? 3 : code === 'A01' ? 2 : 0;
  if (poolName === 'call') return code === 'A22' ? 8 : code === 'A01' ? 4 : code === 'A23' ? 2 : 0;
  return 0;
}

function ensureCount(d, code, min, poolName, fillerCodes) {
  while (codeCount(d, code, (a) => poolOf(a) === poolName) < min) {
    const pool = novAgents.filter((a) => poolOf(a) === poolName);
    const switchable = pool
      .filter((a) => {
        const c = shiftsOf(a.en)[d - 1];
        if (!c || !fillerCodes.includes(c) || c === code) return false;
        // never take the source code below its own minimum
        const srcMin = minFor(poolName, c);
        if (srcMin > 0 && codeCount(d, c, (x) => poolOf(x) === poolName) - 1 < srcMin) return false;
        return true;
      })
      .sort((x, y) =>
        fillerCodes.indexOf(shiftsOf(x.en)[d - 1]) - fillerCodes.indexOf(shiftsOf(y.en)[d - 1])
      )[0];
    if (switchable) {
      const from = shiftsOf(switchable.en)[d - 1];
      shiftsOf(switchable.en)[d - 1] = code;
      switchNotes.push(`${iso(d)} ${switchable.en}: ${from}→${code} (${poolName} rebalance)`);
      continue;
    }
    const cap = poolName === 'chat' ? 22 : 21;
    const resting = pool
      .filter((a) => shiftsOf(a.en)[d - 1] === 'OFF' || !shiftsOf(a.en)[d - 1])
      .filter((a) => !plan.get(a.en).leave.get(iso(d)))
      .filter((a) => consecutiveWorkBefore(a.en, d) < MAX_CONSECUTIVE)
      .sort((x, y) => {
        const fx = plan.get(x.en).family.includes(code) ? 0 : 1;
        const fy = plan.get(y.en).family.includes(code) ? 0 : 1;
        return fx - fy || totalShifts(x.en) - totalShifts(y.en);
      });
    let borrowed = false;
    for (const a of resting) {
      if (totalShifts(a.en) >= cap) {
        // compensate: OFF their most-stocked other workday (above minimums
        // and above that day's pool-total need)
        let compD = 0; let bestScore = -Infinity;
        for (let e = 1; e <= DAYS; e++) {
          if (e === d) continue;
          const c = shiftsOf(a.en)[e - 1];
          if (!WORK_RE.test(c)) continue;
          const stock = codeCount(e, c, (x) => poolOf(x) === poolName);
          const min = minFor(poolName, c);
          if (stock - 1 < min) continue;
          const wkndE = isWeekend(e);
          const poolTotalE = dayCount(e, (cc, x) => WORK_RE.test(cc) && poolOf(x) === poolName);
          const needE = poolName === 'call' ? (wkndE ? 14 : 15) : poolName === 'chat' ? 5 : 1;
          if (poolTotalE - 1 < needE) continue;
          const score = stock - min;
          if (score > bestScore) { bestScore = score; compD = e; }
        }
        if (!compD) continue;
        shiftsOf(a.en)[compD - 1] = 'OFF';
      }
      shiftsOf(a.en)[d - 1] = code;
      flipNotes.push(`${iso(d)} ${a.en}: OFF→${code} (${poolName} coverage)`);
      borrowed = true;
      break;
    }
    if (borrowed) continue;
    break; // pool exhausted
  }
}

const TL_POOL = ['Alexia', 'Harrison'];
const T2_POOL = ['Steven', 'Steve', 'George'];

for (let d = 1; d <= DAYS; d++) {
  const wknd = isWeekend(d);
  // Chat minimums (急转 A01→A22 allowed when A01 stays ≥2).
  ensureCount(d, 'A22', 3, 'chat', ['A23', 'A00', 'A01']);
  ensureCount(d, 'A01', 2, 'chat', ['A23', 'A00']);
  // Call minimums.
  ensureCount(d, 'A22', 8, 'call', ['A23', 'A00']);
  ensureCount(d, 'A01', 4, 'call', ['A23', 'A00']);
  if (!wknd) ensureCount(d, 'A23', 2, 'call', ['A00']);
  // Totals: weekdays ≥15 call · weekends ≥14 call.
  const callTotal = () => dayCount(d, (c, a) => WORK_RE.test(c) && poolOf(a) === 'call');
  const needTotal = wknd ? 14 : 15;
  let guard = 0;
  while (callTotal() < needTotal && guard++ < 8) {
    const before = callTotal();
    for (const code of ['A01', 'A23', 'A00']) {
      ensureCount(d, code, codeCount(d, code, (a) => poolOf(a) === 'call') + 1, 'call', ['A23', 'A00']);
      if (callTotal() >= needTotal) break;
    }
    if (callTotal() === before) break;
  }
  // Chat weekday total ≥5 (A23 filler).
  if (!wknd) {
    const chatTotal = () => dayCount(d, (c, a) => WORK_RE.test(c) && poolOf(a) === 'chat');
    let g2 = 0;
    while (chatTotal() < 5 && g2++ < 4) {
      const before = chatTotal();
      ensureCount(d, 'A23', codeCount(d, 'A23', (a) => poolOf(a) === 'chat') + 1, 'chat', ['A00']);
      if (chatTotal() === before) break;
    }
  }
  // Management: ≥1 TL daily (Mon 2), ≥1 T2 daily (rest pairs already
  // satisfy this — the loop only fires if a leave broke it).
  const tlNow = () => TL_POOL.filter((en) => WORK_RE.test(shiftsOf(en)[d - 1])).length;
  const t2Now = () => T2_POOL.filter((en) => WORK_RE.test(shiftsOf(en)[d - 1])).length;
  const needTl = isMonday(d) ? 2 : 1;
  for (const en of TL_POOL) {
    if (tlNow() >= needTl) break;
    if (WORK_RE.test(shiftsOf(en)[d - 1]) || plan.get(en).leave.get(iso(d))) continue;
    if (consecutiveWorkBefore(en, d) >= MAX_CONSECUTIVE) continue;
    shiftsOf(en)[d - 1] = plan.get(en).family[0];
    flipNotes.push(`${iso(d)} ${en}: rest→${plan.get(en).family[0]} (TL daily coverage)`);
  }
  for (const en of T2_POOL) {
    if (t2Now() >= 1) break;
    if (WORK_RE.test(shiftsOf(en)[d - 1]) || plan.get(en).leave.get(iso(d))) continue;
    if (consecutiveWorkBefore(en, d) >= MAX_CONSECUTIVE) continue;
    shiftsOf(en)[d - 1] = plan.get(en).family[0];
    flipNotes.push(`${iso(d)} ${en}: rest→${plan.get(en).family[0]} (T2 daily coverage)`);
  }
}

/* Pass 4 — balance: trim above the pool's cap by OFF-ing the most-stocked
   day (never below a minimum / TL / T2 need). Chat is deliberately allowed
   up to 22 (the 7-agent pool needs 150 shifts over 30 days = 21.4 each). */
for (const a of novAgents) {
  const pl = plan.get(a.en);
  if (pl.fixed) continue;
  const poolName = poolOf(a);
  const cap = poolName === 'chat' ? 22 : 21;
  while (totalShifts(a.en) > cap) {
    let bestD = 0; let bestScore = -Infinity;
    for (let d = 1; d <= DAYS; d++) {
      const c = shiftsOf(a.en)[d - 1];
      if (!WORK_RE.test(c)) continue;
      const stock = codeCount(d, c, (x) => poolOf(x) === poolName);
      const min = minFor(poolName, c);
      if (stock <= min) continue;
      if (poolName === 'call' || poolName === 'chat') {
        const poolTotal = dayCount(d, (cc, x) => WORK_RE.test(cc) && poolOf(x) === poolName);
        const need = poolName === 'call' ? (isWeekend(d) ? 14 : 15) : isWeekend(d) ? 5 : 5;
        if (poolTotal - 1 < need) continue;
      }
      if (poolName === 'tl' || poolName === 't2') {
        const ppl = poolName === 'tl' ? TL_POOL : T2_POOL;
        const cnt = ppl.filter((en) => WORK_RE.test(shiftsOf(en)[d - 1])).length;
        const need = poolName === 'tl' && isMonday(d) ? 2 : 1;
        if (cnt - 1 < need) continue;
      }
      const score = stock - min + (inBfWindow(d) ? -0.5 : 0);
      if (score > bestScore) { bestScore = score; bestD = d; }
    }
    if (!bestD) break;
    shiftsOf(a.en)[bestD - 1] = 'OFF';
  }
}

/* Pass 4b — final violation-driven lift. Catches whatever Pass 3/4 left
   (leave-day gaps, trim fallout): for each day's missing slot, lift an OFF
   pool agent — family-preferred, fewest shifts, hard cap 22. */
function poolNeed(poolName, d) {
  if (poolName === 'chat') return { A22: 3, A01: 2, total: 5 };
  if (poolName === 'call') {
    const w = isWeekend(d);
    return { A22: 8, A01: 4, A23: w ? 0 : 2, total: w ? 14 : 15 };
  }
  return null;
}

/* Chain-lift: force an at-cap OFF agent to work day d by having them
   give up a workday that a sub-cap OFF colleague then covers. Needed on
   leave-collision days (e.g. two chat members on 事假/调休 the same day). */
function chainLift(d, poolName, code) {
  const pool = novAgents.filter((a) => poolOf(a) === poolName);
  const cands = pool
    .filter((a) => shiftsOf(a.en)[d - 1] === 'OFF')
    .filter((a) => !plan.get(a.en).leave.get(iso(d)))
    .filter((a) => consecutiveWorkBefore(a.en, d) < MAX_CONSECUTIVE)
    .sort((x, y) => totalShifts(x.en) - totalShifts(y.en));
  if (!cands.length) return false;
  const a = cands[0];
  if (totalShifts(a.en) < SHIFTS_HARD_MAX) {
    shiftsOf(a.en)[d - 1] = code;
    flipNotes.push(`${iso(d)} ${a.en}: OFF→${code} (final lift)`);
    return true;
  }
  // at cap — find a workday X of theirs that a sub-cap OFF colleague covers
  // (the cover takes the SAME code, so day X's counts are preserved)
  for (let e = 1; e <= DAYS; e++) {
    if (e === d || !WORK_RE.test(shiftsOf(a.en)[e - 1])) continue;
    const codeX = shiftsOf(a.en)[e - 1];
    const cover = pool
      .filter((b) => b.en !== a.en && shiftsOf(b.en)[e - 1] === 'OFF')
      .filter((b) => !plan.get(b.en).leave.get(iso(e)))
      .filter((b) => consecutiveWorkBefore(b.en, e) < MAX_CONSECUTIVE)
      .filter((b) => totalShifts(b.en) < SHIFTS_HARD_MAX - 1)
      .sort((x, y) => totalShifts(x.en) - totalShifts(y.en))[0];
    if (!cover) continue;
    shiftsOf(a.en)[e - 1] = 'OFF';
    shiftsOf(cover.en)[e - 1] = codeX;
    shiftsOf(a.en)[d - 1] = code;
    flipNotes.push(`${iso(d)} ${a.en}: OFF→${code} (chain via ${iso(e)} → ${cover.en})`);
    return true;
  }
  return false;
}

for (let round = 0; round < 3; round++) {
  let fixedAny = false;
  for (let d = 1; d <= DAYS; d++) {
    for (const poolName of ['chat', 'call']) {
      const need = poolNeed(poolName, d);
      const pool = novAgents.filter((a) => poolOf(a) === poolName);
      const count = (code) => codeCount(d, code, (x) => poolOf(x) === poolName);
      const total = () => dayCount(d, (c, x) => WORK_RE.test(c) && poolOf(x) === poolName);
      // code minimums first
      for (const code of ['A22', 'A01', 'A23']) {
        const min = need[code] ?? 0;
        while (count(code) < min) {
          const cands = pool
            .filter((a) => shiftsOf(a.en)[d - 1] === 'OFF')
            .filter((a) => !plan.get(a.en).leave.get(iso(d)))
            .filter((a) => consecutiveWorkBefore(a.en, d) < MAX_CONSECUTIVE)
            .filter((a) => totalShifts(a.en) < SHIFTS_HARD_MAX)
            .sort((x, y) => {
              const fx = plan.get(x.en).family.includes(code) ? 0 : 1;
              const fy = plan.get(y.en).family.includes(code) ? 0 : 1;
              return fx - fy || totalShifts(x.en) - totalShifts(y.en);
            });
          if (!cands.length) {
            if (chainLift(d, poolName, code)) { fixedAny = true; continue; }
            break;
          }
          shiftsOf(cands[0].en)[d - 1] = code;
          flipNotes.push(`${iso(d)} ${cands[0].en}: OFF→${code} (final lift)`);
          fixedAny = true;
        }
      }
      // pool total
      while (total() < need.total) {
        const cands = pool
          .filter((a) => shiftsOf(a.en)[d - 1] === 'OFF')
          .filter((a) => !plan.get(a.en).leave.get(iso(d)))
          .filter((a) => consecutiveWorkBefore(a.en, d) < MAX_CONSECUTIVE)
          .filter((a) => totalShifts(a.en) < SHIFTS_HARD_MAX)
          .sort((x, y) => totalShifts(x.en) - totalShifts(y.en));
        if (!cands.length) break;
        const fam = plan.get(cands[0].en).family.filter((c) => ['A22', 'A23', 'A00', 'A01'].includes(c));
        const code = fam[0] ?? 'A23';
        shiftsOf(cands[0].en)[d - 1] = code;
        flipNotes.push(`${iso(d)} ${cands[0].en}: OFF→${code} (final lift, total)`);
        fixedAny = true;
      }
    }
  }
  if (!fixedAny) break;
}

/* Pass 5 — leaves + OFF fill. */
for (const a of novAgents) {
  const pl = plan.get(a.en);
  for (let d = 1; d <= DAYS; d++) {
    if (shiftsOf(a.en)[d - 1]) continue;
    const leaveCode = pl.leave.get(iso(d));
    shiftsOf(a.en)[d - 1] = leaveCode ?? 'OFF';
  }
}

/* --------------------------- validation report ---------------------------- */

const report = [];
const push = (line) => report.push(line);
push(`November ${YEAR} roster — validation report`);
push(`DST switch ${DST_SWITCH_ISO} (whole month EST): A21 cancelled, codes +1h (A21→A22, A22→A23, A23→A00, A00→A01).`);
push('');

let hardFails = 0;
for (let d = 1; d <= DAYS; d++) {
  const wknd = isWeekend(d);
  const cA22 = codeCount(d, 'A22', isChat), cA01 = codeCount(d, 'A01', isChat);
  const kA22 = codeCount(d, 'A22', isCall), kA23 = codeCount(d, 'A23', isCall);
  const kA01 = codeCount(d, 'A01', isCall), kA00 = codeCount(d, 'A00', isCall);
  const chatTotal = dayCount(d, (c, a) => WORK_RE.test(c) && isChat(a));
  const callTotal = dayCount(d, (c, a) => WORK_RE.test(c) && isCall(a));
  const tl = TL_POOL.filter((en) => WORK_RE.test(shiftsOf(en)[d - 1])).length;
  const t2 = T2_POOL.filter((en) => WORK_RE.test(shiftsOf(en)[d - 1])).length;
  const fails = [];
  if (cA22 < 3) fails.push(`chat A22 ${cA22}<3`);
  if (cA01 < 2) fails.push(`chat A01 ${cA01}<2`);
  if (!wknd && (chatTotal < 5 || chatTotal > 7)) fails.push(`chat total ${chatTotal}∉5-7`);
  if (kA22 < 8) fails.push(`call A22 ${kA22}<8`);
  if (kA01 < 4) fails.push(`call A01 ${kA01}<4`);
  if (!wknd && kA23 < 2) fails.push(`call A23 ${kA23}<2`);
  if (!wknd && callTotal < 15) fails.push(`call total ${callTotal}<15`);
  if (wknd && callTotal < 14) fails.push(`call total ${callTotal}<14`);
  if (tl < 1) fails.push('no TL');
  if (isMonday(d) && tl < 2) fails.push('Monday needs 2 TL');
  if (t2 < 1) fails.push('no T2');
  if (fails.length) { hardFails += fails.length; push(`  ${iso(d)} (${wknd ? 'WKND' : 'wkday'}) — ${fails.join(' · ')}`); }
}
push(hardFails === 0 ? 'All daily hard constraints PASS.' : `${hardFails} hard-constraint violations (see above).`);
push('');

for (const a of novAgents) {
  const n = totalShifts(a.en);
  const pl = plan.get(a.en);
  if (pl.fixed) continue;
  if (n < 20 || n > 22) push(`  ${a.en}: ${n} shifts (target 20-21, hard max 22)`);
  // >6 consecutive workdays
  let run = 0, maxRun = 0;
  for (let d = 1; d <= DAYS; d++) {
    run = WORK_RE.test(shiftsOf(a.en)[d - 1]) ? run + 1 : 0;
    maxRun = Math.max(maxRun, run);
  }
  if (maxRun > MAX_CONSECUTIVE) push(`  ${a.en}: ${maxRun} consecutive workdays (>6)`);
}
for (const [en, pl] of plan) {
  for (const l of pl.wish?.leave ?? []) {
    if (l.flag) flags.push(`${en}: leave ${l.iso} (${l.code}) — ${l.flag}`);
  }
}
push('');
push('Shift distribution: ' + novAgents.map((a) => `${a.en}=${totalShifts(a.en)}`).join(', '));
push('Flags: ' + (flags.length ? flags.join(' | ') : 'none'));

console.log(report.join('\n'));

/* ------------------------------ day totals -------------------------------- */

/** Replicates the sheet's COUNTIF logic (stat rows below the agent block). */
function dayTotalsFor(agents, shiftsByEn, dayKeys) {
  const onDuty = (en, i) => {
    const c = shiftsByEn(en)[i];
    return c && (c.includes('A') || c.includes('B07'));
  };
  const rows = [];
  const row = (label, fn) => rows.push({ label, values: dayKeys.map((_, i) => fn(i)) });
  row('上班总人数', (i) => agents.filter((a) => onDuty(a.en, i)).length);
  row('OM人数', (i) => agents.filter((a) => a.skill === 'SV' && onDuty(a.en, i)).length);
  row('TL人数', (i) => agents.filter((a) => a.skill === 'TL' && onDuty(a.en, i)).length);
  row('T2人数', (i) => agents.filter((a) => a.skill === 'T2' && onDuty(a.en, i)).length);
  row('T3人数', (i) => agents.filter((a) => a.skill === 'T3' && onDuty(a.en, i)).length);
  for (const code of ['A06', 'A09', 'A21', 'A22', 'A23', 'A00', 'A01']) {
    row(`${code}一线人数`, (i) => agents.filter((a) => shiftsByEn(a.en)[i] === code).length);
  }
  row('Trainee人数', (i) => agents.filter((a) => /TR-/.test(shiftsByEn(a.en)[i] ?? '')).length);
  // The 2 requested headcount rows (rule 10).
  row('Total Chat', (i) => agents.filter((a) => a.skill === 'Chat' && onDuty(a.en, i)).length);
  row('Total Call', (i) => agents.filter((a) => (a.skill === 'Call' || a.skill === 'FR Call') && onDuty(a.en, i)).length);
  return rows;
}

/* ------------------------------- emit files ------------------------------- */

const novKeys = Array.from({ length: DAYS }, (_, i) => iso(i + 1));

function agentBlock(a, shiftsArr, dayKeys) {
  const shiftEntries = dayKeys
    .map((k, i) => `'${k}': '${shiftsArr[i]}'`)
    .join(', ');
  const offPh = shiftsArr.filter((c) => /^(OFF|PH|AL|调休|病假|事假)$/.test(c)).length;
  return `  { no: '${a.no}', hr: '${a.hr}', zh: '${a.zh}', en: "${a.en}", skill: '${a.skill}', hired: '${a.hired}', joined: '${a.joined}', offPh: '${offPh}', bhc: '', phc: '',\n    shifts: { ${shiftEntries} } },`;
}

function totalsBlock(rows) {
  return rows
    .map((r) => `  { label: '${r.label}', values: { ${novKeys.map((k, i) => `'${k}': ${r.values[i]}`).join(', ')} } },`)
    .join('\n');
}

const novOut = [
  '/**',
  ` * AMR NA Roster — ${YEAR}-11 — auto-scheduled by scripts/schedule-nov-roster.mjs`,
  ' * (Oct preferences + 许愿池 wishes + constraint solver). DST: whole month',
  ' * EST — A21 cancelled, codes +1h (A21→A22, A22→A23, A23→A00, A00→A01).',
  ` * Snapshot: ${new Date().toISOString().slice(0, 10)}.`,
  ' */',
  '',
  "import type { RosterAgent, DayTotalRow } from './roster';",
  '',
  `export const ROSTER_${YEAR}11: RosterAgent[] = [`,
  ...novAgents.map((a) => agentBlock(a, shiftsOf(a.en), novKeys)),
  '];',
  '',
  `export const DAY_TOTALS_${YEAR}11: DayTotalRow[] = [`,
  totalsBlock(dayTotalsFor(novAgents, shiftsOf, novKeys)),
  '];',
  '',
].join('\n');
writeFileSync(resolve(DATA_DIR, 'roster-2026-11.ts'), novOut, 'utf-8');
console.log(`\nWrote src/data/roster-2026-11.ts (${novAgents.length} agents).`);

/* Refresh Oct file with dayTotals (same fetch, Oct codes as-is). */
const octKeys = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const octShiftsByEn = (en) => octByEn.get(en)?.shifts ?? [];
const octTotals = dayTotalsFor(
  octAgents.map((a) => ({ ...a, hired: '', joined: '' })),
  (en) => octByEn.get(en)?.shifts ?? Array(31).fill(''),
  octKeys
);
const octOut = [
  '/**',
  ` * AMR NA Roster — ${YEAR}-10 — auto-generated by scripts/sync-roster.mjs /`,
  ' * schedule-nov-roster.mjs from the Feishu workbook "AMR NA Roster 2026".',
  ` * Snapshot: ${new Date().toISOString().slice(0, 10)}. Day totals replicate the`,
  ' * sheet\'s COUNTIF stat rows (上班总人数 / OM / TL / T2 / T3 / per-shift).',
  ' */',
  '',
  "import type { RosterAgent, DayTotalRow } from './roster';",
  '',
  `export const ROSTER_${YEAR}10: RosterAgent[] = [`,
  ...octAgents.map((a) => {
    const shiftEntries = octKeys.map((k, i) => `'${k}': '${a.shifts[i]}'`).join(', ');
    const offPh = a.shifts.filter((c) => /^(OFF|PH|AL|调休|病假|事假)$/.test(c)).length;
    return `  { no: '${a.no}', hr: '${a.hr}', zh: '${a.zh}', en: "${a.en}", skill: '${a.skill}', hired: '', joined: '', offPh: '${offPh}', bhc: '', phc: '',\n    shifts: { ${shiftEntries} } },`;
  }),
  '];',
  '',
  `export const DAY_TOTALS_${YEAR}10: DayTotalRow[] = [`,
  totalsBlock(octTotals),
  '];',
  '',
].join('\n');
writeFileSync(resolve(DATA_DIR, 'roster-2026-10.ts'), octOut, 'utf-8');
console.log(`Wrote src/data/roster-2026-10.ts (${octAgents.length} agents + day totals).`);

if (hardFails > 0) {
  console.log(`\n⚠ ${hardFails} hard-constraint violations remain — see report above.`);
  process.exitCode = 2;
}
