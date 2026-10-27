import { formatCents } from "@sellbridge/shared/money";
import type { ReportSense, ReportTarget, ReportValueFormat } from "./report-model";

const countFormatter = new Intl.NumberFormat("pt-BR");
const ratingFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const pointsFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** "38min", "3h 20min", "2 dias 4h": a time people read at a glance. */
export function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < MINUTES_PER_HOUR) {
    return `${whole}min`;
  }
  if (whole < MINUTES_PER_DAY) {
    const hours = Math.floor(whole / MINUTES_PER_HOUR);
    const rest = whole % MINUTES_PER_HOUR;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
  }
  const days = Math.floor(whole / MINUTES_PER_DAY);
  const hours = Math.round((whole % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const dayWord = days === 1 ? "dia" : "dias";
  return hours === 0 ? `${days} ${dayWord}` : `${days} ${dayWord} ${hours}h`;
}

export function formatReportValue(value: number, format: ReportValueFormat): string {
  if (format === "cents") {
    return formatCents(Math.round(value));
  }
  if (format === "rate") {
    return percentFormatter.format(value);
  }
  if (format === "minutes") {
    return formatMinutes(value);
  }
  if (format === "rating") {
    return ratingFormatter.format(value);
  }
  return countFormatter.format(value);
}

const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Axis marks and bar labels have little room: money reads "R$ 15 mil" instead of
 * "R$ 15.000,00", which wrapped in the axis gutter and ran over the card's note.
 */
export function formatCompactValue(value: number, format: ReportValueFormat): string {
  if (format === "cents") {
    const reais = value / 100;
    // Under a thousand the decimals only make the label wider: "R$ 785", not "R$ 784,5".
    const shown = Math.abs(reais) < 1000 ? Math.round(reais) : reais;
    return `R$ ${compactFormatter.format(shown)}`;
  }
  if (format === "count") {
    return compactFormatter.format(value);
  }
  return formatReportValue(value, format);
}

export type ChangeTone = "good" | "bad" | "neutral";

export interface ReportChange {
  direction: "up" | "down" | "flat";
  tone: ChangeTone;
  /** "3,2 p.p.", "12%", "0,4": the size of the change, without sign (the arrow says it). */
  amount: string;
}

function toneOf(direction: "up" | "down", sense: ReportSense): ChangeTone {
  if (sense === "neutral") {
    return "neutral";
  }
  const better = sense === "higher_is_better" ? "up" : "down";
  return direction === better ? "good" : "bad";
}

function changeAmount(current: number, previous: number, format: ReportValueFormat): string {
  const difference = Math.abs(current - previous);
  if (format === "rate") {
    return `${pointsFormatter.format(difference * 100)} p.p.`;
  }
  if (format === "rating" || format === "minutes" || previous === 0) {
    return formatReportValue(difference, format);
  }
  return percentFormatter.format(difference / Math.abs(previous));
}

/** The change against the previous period, colored by whether it is good news; null without data. */
export function reportChange(
  current: number | null,
  previous: number | null,
  format: ReportValueFormat,
  sense: ReportSense,
): ReportChange | null {
  if (current === null || previous === null) {
    return null;
  }
  if (current === previous) {
    return { direction: "flat", tone: "neutral", amount: "igual" };
  }
  const direction = current > previous ? "up" : "down";
  return {
    direction,
    tone: toneOf(direction, sense),
    amount: changeAmount(current, previous, format),
  };
}

/** "na meta" or "abaixo da meta" / "acima do limite", or null when there is no target or value. */
export function targetStatus(
  value: number | null,
  target: ReportTarget | null,
): { met: boolean; label: string } | null {
  if (value === null || target === null) {
    return null;
  }
  if (target.kind === "min") {
    return value >= target.value
      ? { met: true, label: "na meta" }
      : { met: false, label: "abaixo da meta" };
  }
  return value <= target.value
    ? { met: true, label: "na meta" }
    : { met: false, label: "acima do limite" };
}

/** "≥ 90%" or "≤ 2%". */
export function targetLabel(target: ReportTarget, format: ReportValueFormat): string {
  const sign = target.kind === "min" ? "≥" : "≤";
  return `${sign} ${formatReportValue(target.value, format)}`;
}

/** A share of a whole, or null when the whole is empty (no 0/0 shown as 0%). */
export function rateOf(part: number, whole: number): number | null {
  if (whole <= 0) {
    return null;
  }
  return part / whole;
}

/** "de 179 pedidos". */
export function baseOf(whole: number, noun: string): string {
  return `de ${countFormatter.format(whole)} ${noun}`;
}

/** The value at a percentile (0–1) of a list, nearest-rank; null for an empty list. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((first, second) => first - second);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(fraction * sorted.length)));
  return sorted[rank - 1] ?? null;
}
