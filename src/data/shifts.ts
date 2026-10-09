/**
 * Shift catalog + roster month list for the Shifts workspace UI.
 * Kept separate from roster.ts (which holds only the RosterAgent type) so the
 * roster data files stay a clean, auto-generated type-only surface.
 */

/** Months with a baked roster (1-based month numbers), for the workspace UI. */
export const ROSTER_MONTHS: { year: number; month: number }[] = [
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
  { year: 2026, month: 11 },
];

/** Shift catalog — code, time range and category for the workspace palette. */
export interface ShiftDef {
  code: string;
  time: string;
  category: 'night' | 'midnight' | 'early' | 'day' | 'late' | 'off' | 'ph' | 'leave' | 'comp' | 'training' | 'other';
}

export const SHIFT_CATALOG: ShiftDef[] = [
  { code: 'OFF', time: '—', category: 'off' },
  { code: 'PH', time: '—', category: 'ph' },
  { code: 'AL', time: '—', category: 'leave' },
  { code: '调休', time: '—', category: 'comp' },
  { code: 'TR-A22', time: '22:00–07:00 (training)', category: 'training' },
  { code: 'Farewell', time: '—', category: 'other' },
  { code: 'A21', time: '21:00–06:00', category: 'night' },
  { code: 'A22', time: '22:00–07:00', category: 'night' },
  { code: 'A23', time: '23:00–08:00', category: 'night' },
  { code: 'A00', time: '00:00–09:00', category: 'midnight' },
  { code: 'A01', time: '01:00–10:00', category: 'midnight' },
  { code: 'A02', time: '02:00–11:00', category: 'midnight' },
  { code: 'A05', time: '05:00–14:00', category: 'early' },
  { code: 'A06', time: '06:00–15:00', category: 'early' },
  { code: 'B06', time: '06:30–15:30', category: 'early' },
  { code: 'A07', time: '07:00–16:00', category: 'early' },
  { code: 'A075', time: '07:00–12:00', category: 'early' },
  { code: 'A08', time: '08:00–17:00', category: 'day' },
  { code: 'A0830', time: '08:30–17:30', category: 'day' },
  { code: 'A83', time: '08:30–17:30', category: 'day' },
  { code: 'A930', time: '09:30–18:30', category: 'day' },
  { code: 'A945', time: '09:45–18:45', category: 'day' },
  { code: 'A09', time: '09:00–18:00', category: 'day' },
  { code: 'A10', time: '10:00–19:00', category: 'day' },
  { code: 'A105', time: '10:15–19:15', category: 'day' },
  { code: 'A11', time: '11:00–20:00', category: 'late' },
  { code: 'A12', time: '12:00–21:00', category: 'late' },
  { code: 'A14', time: '14:00–23:00', category: 'late' },
  { code: 'A15', time: '15:00–00:00', category: 'late' },
  { code: 'P09', time: '09:00–13:00 (half)', category: 'day' },
  { code: 'P13', time: '13:00–17:00 (half)', category: 'day' },
  { code: 'B00', time: '00:00–09:00 (三工)', category: 'midnight' },
  { code: 'B21', time: '21:00–06:00 (三工)', category: 'night' },
  { code: 'B22', time: '22:00–07:00 (三工)', category: 'night' },
  { code: 'B23', time: '23:00–08:00 (三工)', category: 'night' },
  { code: 'B01', time: '01:00–10:00 (三工)', category: 'midnight' },
  { code: '事假', time: '— personal leave', category: 'leave' },
  { code: '病假', time: '— sick leave', category: 'leave' },
  { code: '年假', time: '— annual leave', category: 'leave' },
  { code: '产假', time: '— maternity leave', category: 'leave' },
  { code: '行政', time: '— admin', category: 'other' },
  { code: '休息', time: '— rest', category: 'off' },
];
