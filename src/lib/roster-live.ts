/**
 * Roster live store — session-wide overlay of roster cell edits made in the
 * SHIFTS workspace, so other consumers (DASH dailies) recalculate live.
 *
 * Two layers mirror ShiftsWorkspace's resolution order exactly:
 *   • user  — local edits (shift code changes + extra off-hours applied in
 *     the selection toolbar); always wins.
 *   • d1    — cells fetched from the RosterRoom DO / D1 backup; a shift code
 *     override always applies, but a POSITIVE off value is required to
 *     override the baked offHours (pre-migration mirrors report 0 everywhere
 *     and must not shadow the baked comment records).
 *
 * Keys are `${en}|${iso}` within a month key (`YYYY-MM`).
 */

import { useSyncExternalStore } from 'react';

export interface LiveCell {
  code?: string;
  off?: number;
}

interface RosterLiveMonth {
  user: Record<string, LiveCell>;
  d1: Record<string, LiveCell>;
}

const store = new Map<string, RosterLiveMonth>();
const listeners = new Set<() => void>();
let version = 0;

function monthOf(monthKey: string): RosterLiveMonth {
  let m = store.get(monthKey);
  if (!m) {
    m = { user: {}, d1: {} };
    store.set(monthKey, m);
  }
  return m;
}

function notify(): void {
  version += 1;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a broken listener must not break the others */
    }
  }
}

/** Replace a layer of the month's live overlay (user or d1) and notify. */
export function setLiveLayer(
  monthKey: string,
  layer: 'user' | 'd1',
  cells: Record<string, LiveCell>,
): void {
  monthOf(monthKey)[layer] = cells;
  notify();
}

/** Resolved live cell for one agent-day (user layer wins per field). */
export function getLiveCell(monthKey: string, key: string): LiveCell | undefined {
  const m = store.get(monthKey);
  if (!m) return undefined;
  const user = m.user[key];
  const d1 = m.d1[key];
  if (!user && !d1) return undefined;
  return {
    code: user?.code ?? d1?.code,
    off: user?.off ?? (typeof d1?.off === 'number' && d1.off > 0 ? d1.off : undefined),
  };
}

/** All live cells of a month (user layer merged over the d1 layer). */
export function getLiveMonth(monthKey: string): Record<string, LiveCell> {
  const m = store.get(monthKey);
  if (!m) return {};
  return { ...m.d1, ...m.user };
}

/** Incrementing version — components add it to useMemo deps to recompute
 *  whenever any roster cell changes live. */
export function useRosterLiveVersion(): number {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => version,
    () => version,
  );
}
