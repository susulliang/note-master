import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * LocalStorage-backed `useScopedState` — a drop-in replacement that no longer depends
 * on `@lark-apaas/client-toolkit-lite/scopedStorage`.
 *
 * The toolkit version was a thin wrapper over localStorage; reimplementing it here
 * eliminates the 735 kB Feishu runtime the toolkit package transitively bundled.
 */
export function useScopedState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage?.getItem(key);
      if (stored !== null && stored !== undefined) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // ignore parse errors or SSR/localStorage-not-available
    }
    return initialValue;
  });

  // Debounced save to storage
  const timeoutRef = useRef<number | null>(null);

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof newValue === 'function' ? (newValue as (p: T) => T)(prev) : newValue;

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        try {
          window.localStorage?.setItem(key, JSON.stringify(resolved));
        } catch {
          // ignore quota / disabled storage errors
        }
      }, 200);

      return resolved;
    });
  }, [key]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [value, setStoredValue];
}
