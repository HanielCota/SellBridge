export interface MetricPoint {
  date: string;
  orders: number;
  revenueCents: number;
  profitCents: number;
}

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const shortDateWithYear = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** "1 de set. – 30 de set. de 2026", used to say which dates the numbers cover. */
export function formatDateRange(from: string, to: string): string {
  return `${shortDate.format(parseIsoDate(from))} – ${shortDateWithYear.format(parseIsoDate(to))}`;
}

export function formatPointDate(value: string): string {
  return shortDate.format(parseIsoDate(value));
}

const shortMonth = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** "1–30 set." or "17 ago.–15 set.": a range short enough to label a meter row. */
export function formatCompactRange(from: string, to: string): string {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const endLabel = `${end.getUTCDate()} ${shortMonth.format(end)}`;
  if (from === to) {
    return endLabel;
  }
  if (
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear()
  ) {
    return `${start.getUTCDate()}–${endLabel}`;
  }
  return `${start.getUTCDate()} ${shortMonth.format(start)}–${endLabel}`;
}
