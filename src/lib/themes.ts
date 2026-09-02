import { Sun, Sunrise, CloudSun, Sunset, Moon, CloudFog, Cloud, CloudMoon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Theme scale — 8 total: 5 time-of-day (legacy) + 3 neutral grey shades
 * inserted at light / mid / dark stops so agents can pick low-color UI.
 */
export type ThemeId =
  | 'daylight'
  | 'morning'
  | 'afternoon'
  | 'slate-light'
  | 'neutral'
  | 'evening'
  | 'midnight'
  | 'zinc-dark';

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
  { id: 'slate-light', label: 'Slate (Light)', icon: CloudFog, toaster: 'light' },
  { id: 'neutral', label: 'Neutral Grey', icon: Cloud, toaster: 'light' },
  { id: 'evening', label: 'Evening', icon: Sunset, toaster: 'dark' },
  { id: 'midnight', label: 'Midnight', icon: Moon, toaster: 'dark' },
  { id: 'zinc-dark', label: 'Zinc (Dark)', icon: CloudMoon, toaster: 'dark' },
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

/**
 * UI scale — "large" is old-people mode (1.25x zoom: every font ~2 Tailwind
 * sizes up, all boxes/inputs scale with it); "small" auto-applies on narrow
 * screens (0.875x, one size down) so wide UI never triggers scrollbars.
 * Keep in sync with the `body[data-ui-scale=...]` zoom values in
 * tailwind-theme.css.
 */
export type UiScale = 'small' | 'normal' | 'large';

export const LARGE_UI_ZOOM = 1.25;
export const SMALL_UI_ZOOM = 0.875;

/** Below this viewport width the small scale applies automatically */
export const NARROW_SCREEN_WIDTH = 768;
