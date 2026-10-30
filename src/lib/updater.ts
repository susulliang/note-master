/**
 * Updater bridge — wraps `@tauri-apps/plugin-updater` with a typed, React-friendly
 * API that the app shell and Settings page can consume.
 *
 * The Tauri 2 updater plugin is configured in `tauri.conf.json` with a
 * "custom" provider pointing at `latest.json` on GitHub Releases. This module:
 *   - checks for updates (silent on startup, manual from Settings)
 *   - downloads with progress events
 *   - installs (auto-restarts on Windows, manual relaunch on macOS)
 *   - surfaces everything as a simple status + optional info/error
 *
 * Outside the Tauri desktop shell (web build) every function is a safe no-op
 * that returns `null` / throws a helpful error.
 */

import { check as tauriCheck, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { isTauriEnv } from '@/lib/tauri-env';

export interface UpdateInfo {
  /** Current running app version (e.g. "0.7.27") */
  currentVersion: string;
  /** Version available on the update channel (e.g. "0.7.28") */
  availableVersion: string;
  /** Release notes from the manifest (markdown) */
  body?: string;
  /** RFC 3339 publish date from the manifest */
  date?: string;
}

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'up-to-date'
  | 'error';

export interface UpdaterProgress {
  /** Bytes downloaded so far */
  downloaded: number;
  /** Total bytes expected (may be unknown — undefined until first Started event with contentLength) */
  total?: number;
}

export interface UpdaterSnapshot {
  status: UpdaterStatus;
  info?: UpdateInfo;
  progress?: UpdaterProgress;
  error?: string;
  /** Millisecond timestamp of the last check completion (success or failure) */
  lastCheckedAt?: number;
}

/** Listener type for status/progress/error changes. */
export type UpdaterListener = (snapshot: UpdaterSnapshot) => void;

/** Event name dispatched on `window` whenever the updater state changes. */
export const UPDATER_EVENT = 'econote:updater-state';

let activeUpdate: Update | null = null;
let snapshot: UpdaterSnapshot = { status: 'idle' };
const listeners = new Set<UpdaterListener>();

/** Read-only snapshot of the last-known updater state. */
export function getUpdaterSnapshot(): UpdaterSnapshot {
  return snapshot;
}

/** Subscribe to updater state changes. Returns an unsubscribe function. */
export function subscribeUpdater(listener: UpdaterListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const l of listeners) l(snapshot);
  // Also dispatch a DOM event so components outside the React tree can listen.
  window.dispatchEvent(
    new CustomEvent<UpdaterSnapshot>(UPDATER_EVENT, { detail: snapshot })
  );
}

function setSnapshot(patch: Partial<UpdaterSnapshot> & { status?: UpdaterStatus }): void {
  snapshot = { ...snapshot, ...patch };
  emit();
}

/**
 * Check the configured update endpoint for a newer version.
 * Returns the UpdateInfo if an update is available, or `null` if up to date / unavailable.
 *
 * This is safe to call from any environment — outside Tauri it logs and returns null.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauriEnv()) return null;

  setSnapshot({ status: 'checking', error: undefined });

  try {
    // Release any previous update handle before checking again.
    if (activeUpdate) {
      try { await activeUpdate.close(); } catch { /* best-effort */ }
      activeUpdate = null;
    }

    const update = await tauriCheck({ timeout: 15_000 });
    const lastCheckedAt = Date.now();

    if (!update) {
      setSnapshot({ status: 'up-to-date', info: undefined, lastCheckedAt });
      return null;
    }

    activeUpdate = update;
    const info: UpdateInfo = {
      currentVersion: update.currentVersion,
      availableVersion: update.version,
      body: update.body,
      date: update.date,
    };
    setSnapshot({ status: 'available', info, lastCheckedAt, progress: undefined });
    return info;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[updater] check failed:', message);
    setSnapshot({ status: 'error', error: message, lastCheckedAt: Date.now() });
    return null;
  }
}

/**
 * Download the previously-discovered update. Must call `checkForUpdate()` first
 * (or this will throw). Emits progress events to subscribers.
 */
export async function downloadUpdate(): Promise<void> {
  if (!isTauriEnv()) return;
  if (!activeUpdate) {
    throw new Error('No update available — call checkForUpdate() first.');
  }

  setSnapshot({ status: 'downloading', error: undefined, progress: { downloaded: 0 } });

  let downloaded = 0;
  let total: number | undefined;

  try {
    await activeUpdate.download((event: DownloadEvent) => {
      if (event.event === 'Started') {
        total = event.data.contentLength;
        downloaded = 0;
        setSnapshot({ progress: { downloaded: 0, total } });
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        setSnapshot({ progress: { downloaded, total } });
      } else if (event.event === 'Finished') {
        setSnapshot({ status: 'downloaded', progress: { downloaded, total } });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[updater] download failed:', message);
    setSnapshot({ status: 'error', error: message });
    throw err;
  }
}

/**
 * Install the previously-downloaded update.
 *
 * - **Windows**: Tauri launches the NSIS installer and exits the app.
 * - **macOS**: Tauri replaces the running .app bundle — the user must relaunch
 *   the app to pick up the new version (the installer prompt says so).
 */
export async function installUpdate(): Promise<void> {
  if (!isTauriEnv()) return;
  if (!activeUpdate) {
    throw new Error('No update downloaded — call downloadUpdate() first.');
  }

  setSnapshot({ status: 'installing', error: undefined });

  try {
    await activeUpdate.install();
    // On macOS the app is NOT automatically relaunched after install — Tauri
    // replaces the bundle in-place. Show "Restart Required" state so the user
    // knows to quit and reopen. On Windows install() exits the process, so
    // we may not reach this line there.
    setSnapshot({ status: 'idle', info: undefined });
    activeUpdate = null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[updater] install failed:', message);
    setSnapshot({ status: 'error', error: message });
    throw err;
  }
}

/** Full flow: check → download → install. Skips straight to install if already downloaded. */
export async function runFullUpdate(): Promise<void> {
  const info = await checkForUpdate();
  if (!info) return;
  await downloadUpdate();
  await installUpdate();
}
