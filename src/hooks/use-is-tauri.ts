import { useEffect, useState } from 'react';

/**
 * Detects whether the app is running inside a Tauri desktop webview
 * (vs. a plain browser tab). Stable after mount — used to show the
 * native window drag bar and offset the left rail below it.
 */
export function useIsTauri(): boolean {
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    setIsTauri(
      typeof window !== 'undefined' &&
        ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    );
  }, []);
  return isTauri;
}
