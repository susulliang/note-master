/**
 * Desktop-cat overlay bridge — the plumbing that lets the workspace mascot
 * live OUTSIDE the app window as a desktop sprite (see CatDesktopOverlay).
 *
 * The overlay is a second Tauri webview window (`cat-overlay`, created by the
 * `toggle_cat_overlay` Rust command — transparent, always-on-top, frameless).
 * The main window and the overlay talk only through the Tauri event bus:
 *
 *   main → overlay  `cat-desktop:sync`      { catId, napping, scale }
 *   overlay → main  `cat-desktop:pet`       short click → pet the pet model
 *   overlay → main  `cat-desktop:open-chat` double-click → focus app + Ask Kitty
 *   overlay → main  `cat-desktop:position`  { x, y } logical, debounced on move
 *
 * Position is persisted in the MAIN window's localStorage (the overlay webview
 * has its own storage domain) and handed to `toggle_cat_overlay` on creation.
 * Everything here is a no-op outside the Tauri desktop shell (web build).
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from '@/lib/tauri-env';

export const CAT_DESKTOP_EVENTS = {
  sync: 'cat-desktop:sync',
  /** Overlay → main, emitted on overlay mount: "re-send my current state". */
  hello: 'cat-desktop:hello',
  pet: 'cat-desktop:pet',
  openChat: 'cat-desktop:open-chat',
  position: 'cat-desktop:position',
  /** Main → overlay: banner-notification mirror for the thought bubble. */
  thought: 'cat-desktop:thought',
  /** Overlay → main: context-menu navigation request. */
  navigate: 'cat-desktop:navigate',
} as const;

/** View jumps the overlay context menu can request. */
export type CatDesktopNavigateView = 'app' | 'ask-kitty' | 'commune' | 'collab' | 'settings';

/** Window event fired on the main window whenever the enabled flag flips. */
export const CAT_DESKTOP_ENABLED_EVENT = 'cat-desktop-enabled-changed';

const ENABLED_STORAGE_KEY = '__app_ecovacs_cat_desktop_enabled';

/** Whether the desktop-cat mode is ON (persisted, main-window storage). */
export function catDesktopEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Flip desktop-cat mode and notify listeners (Settings toggle → effects). */
export function setCatDesktopEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* private mode / unavailable */
  }
  window.dispatchEvent(new CustomEvent(CAT_DESKTOP_ENABLED_EVENT));
}

export interface CatDesktopSyncPayload {
  catId: string;
  napping: boolean;
  scale: number;
}

export interface CatDesktopPosition {
  x: number;
  y: number;
}

const POSITION_STORAGE_KEY = '__app_ecovacs_cat_desktop_position';

/** True when the desktop overlay is available (Tauri desktop shell only). */
export function catDesktopAvailable(): boolean {
  return isTauriEnv();
}

/**
 * Show or hide the overlay (idempotent — safe to call repeatedly with the
 * same value; the Rust side no-ops when the window already matches).
 * `position` restores the last dragged spot (logical coords).
 * Returns null when unavailable/failed (web build, Rust error).
 */
export async function setCatDesktopOverlay(
  show: boolean,
  position?: CatDesktopPosition | null
): Promise<boolean | null> {
  if (!isTauriEnv()) return null;
  try {
    await invoke('set_cat_overlay', {
      show,
      x: show ? (position?.x ?? null) : null,
      y: show ? (position?.y ?? null) : null,
    });
    return show;
  } catch (err) {
    console.error('set_cat_overlay failed:', err);
    return null;
  }
}

export function loadCatDesktopPosition(): CatDesktopPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatDesktopPosition;
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCatDesktopPosition(position: CatDesktopPosition): void {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    /* private mode / unavailable */
  }
}
