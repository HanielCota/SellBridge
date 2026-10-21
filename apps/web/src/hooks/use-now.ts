import { useEffect, useState } from "react";

const ONE_MINUTE = 60_000;

/**
 * The current time, refreshed every minute: enough for deadlines shown as "vence em 2 h" or
 * "hoje às 14:30" to stay right while the page is open, without re-rendering every second.
 */
export function useNow(intervalMilliseconds = ONE_MINUTE): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMilliseconds);
    return () => clearInterval(timer);
  }, [intervalMilliseconds]);
  return now;
}
