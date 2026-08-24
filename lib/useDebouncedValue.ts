import { useEffect, useState } from 'react';

/**
 * Trailing debounce.
 *
 * Longer than a web app's 300ms on purpose. Text on a TV arrives through an
 * on-screen keyboard driven by a D-pad, so a five-letter word is roughly twenty
 * key presses spread over several seconds — a short debounce fires a query for
 * almost every one of them, and the result list flickering under a half-typed
 * word is the thing that makes TV search feel broken.
 */
export function useDebouncedValue<T>(value: T, delayMs = 600): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
