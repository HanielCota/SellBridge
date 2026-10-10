const DAY_MILLISECONDS = 86_400_000;

export function daysBefore(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MILLISECONDS);
}
