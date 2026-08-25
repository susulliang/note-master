import { Sun, Sunrise, CloudSun, Sunset, Moon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Theme scale — 5 steps from bright to dark, suitable for any work time of
 * the day. The toggle button cycles through them in this order.
 */
export type ThemeId = 'daylight' | 'morning' | 'afternoon' | 'evening' | 'midnight';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  icon: LucideIcon;
  /** Sonner toaster appearance */
  toaster: 'light' | 'dark';
}

export const THEMES: ThemeMeta[] = [
  { id: 'daylight', label: 'Daylight', icon: Sun, toaster: 'light' },
  { id: 'morning', label: 'Morning', icon: Sunrise, toaster: 'light' },
  { id: 'afternoon', label: 'Afternoon', icon: CloudSun, toaster: 'light' },
  { id: 'evening', label: 'Evening', icon: Sunset, toaster: 'dark' },
  { id: 'midnight', label: 'Midnight', icon: Moon, toaster: 'dark' },
];

/** Accepts raw persisted values (incl. legacy 'dark'/'light') and returns a valid ThemeId */
export function normalizeTheme(value: unknown): ThemeId {
  if (typeof value === 'string') {
    if (THEMES.some((t) => t.id === value)) return value as ThemeId;
    // Migrate legacy two-theme values
    if (value === 'light') return 'daylight';
    if (value === 'dark') return 'midnight';
  }
  return 'midnight';
}

export function getThemeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[THEMES.length - 1];
}

export function nextTheme(id: ThemeId): ThemeId {
  const idx = THEMES.findIndex((t) => t.id === id);
  return THEMES[(idx + 1) % THEMES.length].id;
}
