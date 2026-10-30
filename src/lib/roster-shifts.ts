import { getRoster, ROSTER_MONTHS } from '@/data/roster-index';
import rosterAliasOverrides from '@/data/roster-alias-overrides.json';
import type { RosterAgent } from '@/data/roster';
import { getLiveCell } from '@/lib/roster-live';

/**
 * Shift codes that count as "not worked" for the MTD shift denominator:
 * regular rest days (OFF), public holidays (PH), annual leave (AL), and the
 * Chinese leave codes for compensatory / sick / personal leave.
 */
export const OFF_SHIFT_CODES = new Set(['OFF', 'PH', 'AL', '调休', '病假', '事假']);

/** Returns true if the given shift code represents a worked shift. */
export function isWorkedShift(code: string): boolean {
  return !!code && !OFF_SHIFT_CODES.has(code);
}

/** Training shifts (TR-A**) are worked but carry no billable hours. */
export function isTrainingShift(code: string): boolean {
  return code.startsWith('TR');
}

/** Standard shift = 9h on-site with a 1h break → 8 billable hours. */
export const STANDARD_SHIFT_HOURS = 8;

/**
 * Billable hours for one agent-day: a worked shift is worth 8h by default,
 * minus any extra off-time recorded for that cell (调休/事假/年假/病假
 * comments, e.g. "调休1H" → 7h, "调休2H0100-0300" → 6h, "调休8H" → 0h).
 * Non-worked codes (OFF/PH/AL/调休/病假/事假) are worth 0.
 */
export function effectiveHours(a: RosterAgent, iso: string, code: string): number {
  if (!isWorkedShift(code)) return 0;
  return Math.max(0, STANDARD_SHIFT_HOURS - (a.offHours?.[iso] ?? 0));
}

export interface ShiftCount {
  /** Per-agent MTD worked-shift counts, keyed by English name. */
  byAgent: Record<string, number>;
  /** Sum of all agents' MTD worked shifts. */
  total: number;
  /** Per-agent MTD billable hours (shift-equiv = hours / 8). */
  hoursByAgent: Record<string, number>;
  /** Sum of all agents' MTD billable hours. */
  totalHours: number;
}

/** "YYYY-MM" for a given ISO date string (or today's month). */
function monthKey(dateStr?: string): string {
  if (dateStr) return dateStr.slice(0, 7);
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Picks the roster for the month of `start` (or today). Falls back to the
 * most recent available month if the requested month isn't baked yet.
 */
function pickRoster(start?: string): RosterAgent[] {
  const key = monthKey(start);
  let roster = getRoster(key);
  if (!roster) {
    // Fall back to the latest available month (empty future months still
    // expose the agent list, which is enough for name matching).
    const months = ROSTER_MONTH_KEYS;
    if (months.length) roster = getRoster(months[months.length - 1]);
  }
  return roster ?? [];
}

/** All available roster month keys (sorted ascending). */
export const ROSTER_MONTH_KEYS = [...ROSTER_MONTHS];

/**
 * Extracts the calendar date (YYYY-MM-DD) from a Salesforce "As of" timestamp
 * such as "2026-10-09 19:51:51 Eastern Standard Time/EST".
 *
 * SF exports are stamped in New York time (EST/EDT, UTC-5/-4); the roster is
 * kept in Beijing time (CST, UTC+8). Beijing is 12-13h ahead, so a NY calendar
 * date D corresponds to roster dates up to and including D — the Beijing shift
 * day D+1 starts at ~20:00 EST on day D, i.e. after the end-of-day SF cutoff,
 * so it must NOT be counted. Using the NY asOf date directly as the roster
 * cutoff therefore avoids over-including one shift day.
 */
export function asOfDate(asOf: string | null | undefined): string | null {
  if (!asOf) return null;
  const m = asOf.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** The first day (YYYY-MM-01) of the month containing the given date. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function rosterNameParts(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function startsWithParts(source: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((part, index) => source[index] === part);
}

function matchRosterAliasOverride(
  owner: string,
  shiftsByAgent: Record<string, number>,
): RosterShiftMatch | null {
  const ownerParts = rosterNameParts(owner);
  for (const override of rosterAliasOverrides.overrides) {
    const matchesAlias = override.sfAliases.some((alias) =>
      startsWithParts(ownerParts, rosterNameParts(alias))
    );
    const shifts = shiftsByAgent[override.roster.en];
    if (matchesAlias && typeof shifts === 'number') {
      return { name: override.roster.en, shifts };
    }
  }
  return null;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  if (i < a.length || j < b.length) edits++;
  return edits <= 1;
}

function firstNameScore(owner: string, roster: string): number {
  if (owner === roster) return 100;
  const shorter = owner.length <= roster.length ? owner : roster;
  const longer = owner.length <= roster.length ? roster : owner;
  if (shorter.length >= 4 && longer.startsWith(shorter) && longer.length - shorter.length <= 2) return 80;
  if (shorter.length >= 4 && editDistanceAtMostOne(owner, roster)) return 70;
  return 0;
}

export interface RosterShiftMatch {
  name: string;
  shifts: number;
}

/**
 * Match report owner identities to roster names conservatively. Handles
 * first-name truncations/typos and full surname-to-roster-initial matches,
 * but returns null when the best roster candidate is ambiguous.
 */
export function matchRosterShift(
  owner: string,
  shiftsByAgent: Record<string, number>,
): RosterShiftMatch | null {
  const ownerParts = rosterNameParts(owner);
  const ownerFirst = ownerParts[0];
  if (!ownerFirst) return null;
  const ownerLast = ownerParts[ownerParts.length - 1]!;
  const candidates: { name: string; shifts: number; score: number }[] = [];

  for (const [name, shifts] of Object.entries(shiftsByAgent)) {
    const rosterParts = rosterNameParts(name);
    const rosterFirst = rosterParts[0];
    if (!rosterFirst) continue;
    const firstScore = firstNameScore(ownerFirst, rosterFirst);
    if (!firstScore) continue;

    let score = firstScore;
    const rosterLast = rosterParts[rosterParts.length - 1]!;
    if (rosterParts.length === 1) {
      score += 10;
    } else if (ownerParts.length === 1) {
      score -= 10;
    } else if (ownerLast[0] === rosterLast[0]) {
      score += 30;
    } else {
      score -= 20;
    }
    candidates.push({ name, shifts, score });
  }

  if (!candidates.length) return matchRosterAliasOverride(owner, shiftsByAgent);
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 1 && candidates[0]!.score === candidates[1]!.score) {
    return matchRosterAliasOverride(owner, shiftsByAgent);
  }
  return { name: candidates[0]!.name, shifts: candidates[0]!.shifts };
}

/**
 * Builds a predicate that resolves a report owner (SF "Case Owner" / agent
 * name) to the roster and returns true only when the matched agent's skill is
 * in `skills`. Used to exclude TL / T2 / SV(OM) / DTC-processed tickets from
 * the dailies numerators so only frontline Call/Chat agents' work counts.
 * Unresolvable owners (no confident roster match) are excluded.
 */
export function makeFrontlineFilter(
  start: string | undefined,
  skills: readonly string[],
): (owner: string) => boolean {
  const roster = pickRoster(start);
  const all: Record<string, number> = {};
  const skillByName = new Map<string, string>();
  for (const a of roster) {
    all[a.en] = 1;
    skillByName.set(a.en, a.skill);
  }
  const set = new Set(skills);
  const cache = new Map<string, boolean>();
  return (owner: string) => {
    const cached = cache.get(owner);
    if (cached !== undefined) return cached;
    const match = matchRosterShift(owner, all);
    const ok = match ? set.has(skillByName.get(match.name) ?? '') : false;
    cache.set(owner, ok);
    return ok;
  };
}

/**
 * Counts Month-To-Date worked shifts for the roster, between `start`
 * (inclusive) and `end` (inclusive). Defaults to the current calendar month
 * from the 1st through today.
 *
 * @param includeSkills  When provided, only count shifts for agents whose
 *   `skill` is in this set. e.g. ['Chat','Call','FR Call'] to exclude
 *   SV/TL/T2/T3/DTC from the dailies denominator.
 * @param roster  Override the roster; defaults to the month of `start`.
 */
export function countMtdShifts(
  start?: string,
  end?: string,
  roster?: RosterAgent[],
  includeSkills?: string[],
): ShiftCount {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const first = start ?? `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = end ?? `${y}-${String(m + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const skillSet = includeSkills ? new Set(includeSkills) : null;
  const agents = roster ?? pickRoster(first);

  const byAgent: Record<string, number> = {};
  const hoursByAgent: Record<string, number> = {};
  let total = 0;
  let totalHours = 0;
  const month = first.slice(0, 7);
  for (const a of agents) {
    if (skillSet && !skillSet.has(a.skill)) continue;
    let n = 0;
    let hours = 0;
    for (const [date, bakedCode] of Object.entries(a.shifts)) {
      if (date < first || date > last) continue;
      // Live overlay (SHIFTS edits / D1 cells) wins over the baked snapshot.
      const live = getLiveCell(month, `${a.en}|${date}`);
      const code = live?.code ?? bakedCode;
      if (!isWorkedShift(code)) continue;
      // Training shifts (TR-A**) count toward attendance but 0 billable hours.
      const off = isTrainingShift(code) ? STANDARD_SHIFT_HOURS : (typeof live?.off === 'number' ? live.off : (a.offHours?.[date] ?? 0));
      n++;
      hours += Math.max(0, STANDARD_SHIFT_HOURS - off);
    }
    byAgent[a.en] = n;
    hoursByAgent[a.en] = hours;
    total += n;
    totalHours += hours;
  }
  return { byAgent, total, hoursByAgent, totalHours };
}
