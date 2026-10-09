/**
 * Shared roster types. Auto-generated companion of sync-roster.mjs.
 */

export interface RosterAgent {
  no: string;
  hr: string;
  zh: string;
  /** English name — the display/filter key. */
  en: string;
  /** Main skill: SV / TL / T2 / T3 / FR Call / DTC / Chat / Call … */
  skill: string;
  hired: string;
  joined: string;
  /** Count of OFF/PH/AL/调休/病假/事假 days in the month. */
  offPh: string;
  /** BHC — computed by the source sheet (empty if absent). */
  bhc: string;
  /** PHC — computed by the source sheet (empty if absent). */
  phc: string;
  /** ISO date (YYYY-MM-DD) → shift code. */
  shifts: Record<string, string>;
}
