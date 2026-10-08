import { useEffect, useState } from 'react';

/**
 * Sentinel "device name" meaning: capture EVERYTHING the system plays via
 * macOS ScreenCaptureKit (macOS 13+) instead of one input device — no
 * virtual loopback driver (BlackHole) needed. Lives here (not tauri-audio)
 * so the browser build can reference it without bundling @tauri-apps/api.
 */
export const SYSTEM_AUDIO_DEVICE = '__system_audio__';

/** True when running inside the Tauri desktop shell. */
export function isTauriEnv(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
  );
}

/** React hook that reports whether we are inside the Tauri desktop shell. */
export function useIsTauri(): boolean {
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    setIsTauri(isTauriEnv());
  }, []);
  return isTauri;
}
