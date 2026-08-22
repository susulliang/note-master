import { useState, useEffect, useCallback, useRef } from 'react';
import { scopedStorage } from '@lark-apaas/client-toolkit-lite';

export function useScopedState<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = scopedStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // ignore parse errors
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
          scopedStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // ignore storage errors
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
