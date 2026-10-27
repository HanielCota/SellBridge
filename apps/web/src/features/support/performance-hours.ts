import type { HeatCell, SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import { SUPPORT_HOURS } from "@sellbridge/shared/support-hours";
import { formatMinutes, subjectFullLabel } from "./performance-format";

/*
 * The hours map in words: averages per week (so 7, 30 and 90 days read alike), the busiest two
 * hours, what arrives with the team closed and where customers wait longest.
 */

export type HoursMode = "arrive" | "wait";

export const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;
export const WEEKDAY_FULL = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
] as const;

const oneDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const DAYS_PER_WEEK = 7;
/** A wait this much above the day's average reads as "acima do normal". */
const SLOW_GAP_MINUTES = 15;
/** At least this many tickets per week make a slot "um dos mais cheios". */
const BUSY_PER_WEEK = 7;

export const SUPPORT_HOURS_TEXT = `Horário do suporte: todos os dias, ${SUPPORT_HOURS.opensAtHour}h às ${SUPPORT_HOURS.closesAtHour}h`;

export function weeksOf(report: Pick<SupportPerformanceReport, "period">): number {
  return Math.max(1, report.period.days / DAYS_PER_WEEK);
}

/** "por semana" when the period has whole weeks to average, "no período" when shorter. */
export function perWeekUnit(report: Pick<SupportPerformanceReport, "period">): string {
  return report.period.days >= DAYS_PER_WEEK ? "por semana" : "no período";
}

export function perWeek(cell: Pick<HeatCell, "opened">, weeks: number): number {
  return cell.opened / weeks;
}

export function formatPerWeek(value: number): string {
  return oneDecimal.format(Math.round(value * 10) / 10);
}

export function hourLabel(hour: number | "outside"): string {
  return hour === "outside" ? "Fora" : `${hour}h`;
}

/** "Segunda, 9h às 10h" or "Segunda, fora do horário". */
export function cellTitle(cell: Pick<HeatCell, "weekday" | "hour">): string {
  const day = WEEKDAY_FULL[cell.weekday] ?? "";
  if (cell.hour === "outside") {
    return `${day}, fora do horário (${SUPPORT_HOURS.closesAtHour}h às ${SUPPORT_HOURS.opensAtHour}h)`;
  }
  return `${day}, ${cell.hour}h às ${cell.hour + 1}h`;
}

function insideCells(cells: readonly HeatCell[]): HeatCell[] {
  return cells.filter((cell) => cell.hour !== "outside");
}

/** The two consecutive support hours of one day with the most tickets. */
export function peakWindow(
  cells: readonly HeatCell[],
): { weekday: number; from: number; opened: number } | null {
  let best: { weekday: number; from: number; opened: number } | null = null;
  for (const cell of insideCells(cells)) {
    if (cell.hour === "outside") {
      continue;
    }
    const next = cells.find(
      (item) => item.weekday === cell.weekday && item.hour === Number(cell.hour) + 1,
    );
    const opened = cell.opened + (next?.opened ?? 0);
    if (opened > 0 && (best === null || opened > best.opened)) {
      best = { weekday: cell.weekday, from: cell.hour, opened };
    }
  }
  return best;
}

export function peakText(peak: { weekday: number; from: number }): string {
  return `${WEEKDAY_SHORT[peak.weekday] ?? ""}, ${peak.from}h–${peak.from + 2}h`;
}

/** The support hour where the first response took longest (median), with at least two tickets. */
export function slowestCell(cells: readonly HeatCell[]): HeatCell | null {
  return (
    insideCells(cells)
      .filter((cell) => cell.firstResponseMinutes !== null && cell.opened >= 2)
      .toSorted(
        (first, second) => (second.firstResponseMinutes ?? 0) - (first.firstResponseMinutes ?? 0),
      )
      .at(0) ?? null
  );
}

/** Share of tickets that arrive with the team closed, and their median wait. */
export function outsideSummary(cells: readonly HeatCell[]): {
  share: number | null;
  minutes: number | null;
} {
  const total = cells.reduce((sum, cell) => sum + cell.opened, 0);
  const outside = cells.filter((cell) => cell.hour === "outside");
  const waits = outside.flatMap((cell) =>
    cell.firstResponseMinutes === null ? [] : [cell.firstResponseMinutes],
  );
  return {
    share: total === 0 ? null : outside.reduce((sum, cell) => sum + cell.opened, 0) / total,
    minutes: waits.length === 0 ? null : Math.max(...waits),
  };
}

function dayAverageWait(cells: readonly HeatCell[], weekday: number): number | null {
  const waits = insideCells(cells)
    .filter((cell) => cell.weekday === weekday)
    .flatMap((cell) => (cell.firstResponseMinutes === null ? [] : [cell.firstResponseMinutes]));
  return waits.length === 0 ? null : waits.reduce((sum, value) => sum + value, 0) / waits.length;
}

export interface CellTip {
  title: string;
  value: string;
  unit: string;
  rank: string;
  wait: string;
  waitGap: string | null;
  waitTone: "slow" | "fast" | null;
  responders: string;
  subject: string | null;
  note: string;
  noteTone: "danger" | "warning" | "info" | "good";
}

function rankText(cells: readonly HeatCell[], cell: HeatCell): string {
  if (cell.hour === "outside") {
    return "Somando a noite toda, até o suporte abrir";
  }
  const day = insideCells(cells).filter((item) => item.weekday === cell.weekday);
  const rank = day.filter((item) => item.opened > cell.opened).length + 1;
  const dayName = (WEEKDAY_FULL[cell.weekday] ?? "").toLowerCase();
  return rank === 1
    ? `O horário mais cheio de ${dayName}`
    : `${rank}º horário mais cheio de ${dayName}`;
}

function waitGapOf(cells: readonly HeatCell[], cell: HeatCell) {
  const average = dayAverageWait(cells, cell.weekday);
  if (cell.hour === "outside" || cell.firstResponseMinutes === null || average === null) {
    return { text: null, tone: null, gap: 0 };
  }
  const gap = Math.round(cell.firstResponseMinutes - average);
  if (gap > 5) {
    return {
      text: `+${formatMinutes(gap)} acima da média do dia`,
      tone: gap > SLOW_GAP_MINUTES ? ("slow" as const) : null,
      gap,
    };
  }
  if (gap < -5) {
    return { text: `${formatMinutes(-gap)} abaixo da média do dia`, tone: "fast" as const, gap };
  }
  return { text: "na média do dia", tone: null, gap };
}

function noteOf(cell: HeatCell, gap: number, weeks: number): Pick<CellTip, "note" | "noteTone"> {
  if (cell.hour === "outside") {
    return { note: "A equipe está fechada: o cliente espera o suporte abrir.", noteTone: "danger" };
  }
  if (gap > SLOW_GAP_MINUTES) {
    return { note: "Demora acima do normal: vale reforçar a equipe aqui.", noteTone: "warning" };
  }
  if (perWeek(cell, weeks) >= BUSY_PER_WEEK) {
    return { note: "Um dos horários mais cheios da semana.", noteTone: "info" };
  }
  return { note: "Tudo em dia neste horário.", noteTone: "good" };
}

/** The hover card of one cell. */
export function cellTip(report: SupportPerformanceReport, cell: HeatCell): CellTip {
  const weeks = weeksOf(report);
  const gap = waitGapOf(report.heatmap, cell);
  const responders = Math.round(cell.responders);
  return {
    title: cellTitle(cell),
    value: formatPerWeek(perWeek(cell, weeks)),
    unit: `chamados ${perWeekUnit(report)}`,
    rank: rankText(report.heatmap, cell),
    wait: formatMinutes(cell.firstResponseMinutes),
    waitGap: gap.text,
    waitTone: gap.tone,
    responders:
      responders === 0 ? "ninguém" : `${responders} ${responders === 1 ? "pessoa" : "pessoas"}`,
    subject: cell.topSubject === null ? null : subjectFullLabel(cell.topSubject),
    ...noteOf(cell, gap.gap, weeks),
  };
}
