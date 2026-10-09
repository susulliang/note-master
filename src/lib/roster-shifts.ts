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
