import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. Useful for delaying expensive operations (e.g. search) until the
 * user stops typing.
 *
 * @param value - The value to debounce.
 * @param delay - Debounce delay in milliseconds. Defaults to 150.
 */
export function useDebounce<T>(value: T, delay = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
