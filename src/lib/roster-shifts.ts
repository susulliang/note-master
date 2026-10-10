import { getRoster, ROSTER_MONTHS } from '@/data/roster-index';
import type { RosterAgent } from '@/data/roster';

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

export interface ShiftCount {
  /** Per-agent MTD worked-shift counts, keyed by English name. */
  byAgent: Record<string, number>;
  /** Sum of all agents' MTD worked shifts. */
  total: number;
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

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 1 && candidates[0]!.score === candidates[1]!.score) return null;
  return { name: candidates[0]!.name, shifts: candidates[0]!.shifts };
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
  let total = 0;
  for (const a of agents) {
    if (skillSet && !skillSet.has(a.skill)) continue;
    let n = 0;
    for (const [date, code] of Object.entries(a.shifts)) {
      if (date >= first && date <= last && isWorkedShift(code)) n++;
    }
    byAgent[a.en] = n;
    total += n;
  }
  return { byAgent, total };
}
