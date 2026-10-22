import { validationError } from "../runtime/errors.ts";

/**
 * When the support team answers: every day, weekends included, from `opensAtHour` (inclusive)
 * to `closesAtHour` (exclusive), on the Brasília clock. Only shown on screen for now: the
 * internal response deadline (`ticket-rules.ts`) still counts calendar hours.
 */
export const SUPPORT_HOURS = {
  opensAtHour: 8,
  closesAtHour: 18,
  timeZone: "America/Sao_Paulo",
} as const;

// `h23` keeps midnight as 0; the default `h24` cycle of some engines reports it as 24.
const hourInSupportTimeZone = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: SUPPORT_HOURS.timeZone,
});

function supportClockHour(now: Date): number {
  if (Number.isNaN(now.getTime())) {
    throw validationError(
      `Invalid date for the support hours: got ${String(now)}, expected a valid Date.`,
    );
  }
  return Number(hourInSupportTimeZone.format(now));
}

/** Whether the team is at work at `now`, read on the São Paulo clock whatever the machine's zone. */
export function isWithinSupportHours(now: Date): boolean {
  const hour = supportClockHour(now);
  return hour >= SUPPORT_HOURS.opensAtHour && hour < SUPPORT_HOURS.closesAtHour;
}
