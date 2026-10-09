import { formatAbsoluteTime, formatSmartDate } from "@/lib/relative-time";

/** A date in the app's single style, with the exact date and time on hover. */
export function SmartDate({ date, className }: { date: Date; className?: string }) {
  return (
    // Relative text depends on "now", so server and browser may differ by a minute.
    <time
      dateTime={date.toISOString()}
      title={formatAbsoluteTime(date)}
      className={className}
      suppressHydrationWarning
    >
      {formatSmartDate(date)}
    </time>
  );
}
