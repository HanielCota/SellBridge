import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { formatRelativeTime } from "@/lib/relative-time";

const dayAndTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});

/** "há 5 minutos · 13/11 14:02": how recent at a glance, and the exact moment to look up logs. */
export function problemWhenLabel(date: Date, now: Date = new Date()): string {
  return `${formatRelativeTime(date, now)} · ${dayAndTime.format(date).replace(",", "")}`;
}

/** "1 vez", "12 vezes", with the thousands separator. */
export function occurrencesLabel(count: number): string {
  const amount = count.toLocaleString("pt-BR");
  return `${amount} ${count === 1 ? "vez" : "vezes"}`;
}
