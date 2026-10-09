import { useEffect, useState } from "react";

export function useDebouncedValue<TValue>(value: TValue, delayMilliseconds: number): TValue {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMilliseconds);
    return () => clearTimeout(timer);
  }, [value, delayMilliseconds]);
  return debounced;
}
