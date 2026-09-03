import { Sun, Sunrise, CloudSun, Sunset, Moon, CloudFog, Cloud, CloudMoon } from 'lucide-react';
export const THEMES = [
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
export function normalizeTheme(value) {
    if (typeof value === 'string') {
        if (THEMES.some((t) => t.id === value))
            return value;
        // Migrate legacy two-theme values
        if (value === 'light')
            return 'daylight';
        if (value === 'dark')
            return 'midnight';
    }
    return 'midnight';
}
export function getThemeMeta(id) {
    return THEMES.find((t) => t.id === id) ?? THEMES[THEMES.length - 1];
}
export function nextTheme(id) {
    const idx = THEMES.findIndex((t) => t.id === id);
    return THEMES[(idx + 1) % THEMES.length].id;
}
export const LARGE_UI_ZOOM = 1.25;
export const SMALL_UI_ZOOM = 0.875;
/** Below this viewport width the small scale applies automatically */
export const NARROW_SCREEN_WIDTH = 768;
