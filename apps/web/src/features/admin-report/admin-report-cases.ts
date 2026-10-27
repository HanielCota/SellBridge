import { TICKET_PRIORITY_LABELS } from "@sellbridge/shared/schemas";
import {
  answeredOnTime,
  minutesBetween,
  type OpenedTicketRow,
  type QueueRow,
  type RatingRow,
  type ResolutionRow,
  type SubjectKey,
} from "@sellbridge/shared/support-performance";
import { RESPONSE_TARGET_HOURS, ticketCode } from "@sellbridge/shared/ticket-rules";
import { baseOf, formatMinutes } from "@/features/report-kit/report-format";
import {
  CASES_PER_TAB,
  type MonthlyReport,
  type ReportCase,
  type ReportCaseTab,
} from "@/features/report-kit/report-model";
import { subjectFullLabel } from "@/features/support/performance-format";
import type { PeriodRows } from "./admin-report-rows";
import { LOW_RATING_MAX } from "./admin-report-rules";

const HOUR_MILLISECONDS = 3_600_000;
const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function ticketHref(ticketId: string): string {
  return `/admin/chamados/${ticketId}`;
}

function caseTitle(row: SubjectKey & { ticketId: string }): string {
  return `#${ticketCode(row.ticketId)} · ${subjectFullLabel(row)}`;
}

function tabOf(key: string, label: string, items: readonly ReportCase[]): ReportCaseTab {
  return {
    key,
    label,
    items: items.slice(0, CASES_PER_TAB),
    more: Math.max(0, items.length - CASES_PER_TAB),
  };
}

/** Late for sure: answered after the deadline, or still unanswered past it. */
export function lateTickets(opened: readonly OpenedTicketRow[], now: Date): OpenedTicketRow[] {
  return opened.filter((row) => {
    const deadline =
      row.createdAt.getTime() + RESPONSE_TARGET_HOURS[row.priority] * HOUR_MILLISECONDS;
    const judged = row.firstResponseAt !== null || deadline < now.getTime();
    return judged && !answeredOnTime(row);
  });
}

export function lowRatings(ratings: readonly RatingRow[]): RatingRow[] {
  return ratings
    .filter((row) => row.rating <= LOW_RATING_MAX)
    .toSorted(
      (first, second) =>
        first.rating - second.rating || second.ratedAt.getTime() - first.ratedAt.getTime(),
    );
}

function lowRatingCase(row: RatingRow): ReportCase {
  return {
    id: `rating-${row.ticketId}-${row.ratedAt.toISOString()}`,
    title: caseTitle(row),
    detail: row.comment?.trim() ? `"${row.comment.trim()}"` : "Sem comentário.",
    meta: `Nota ${row.rating} · ${dayFormatter.format(row.ratedAt)}`,
    href: ticketHref(row.ticketId),
  };
}

function lateCase(row: OpenedTicketRow, now: Date): ReportCase {
  const target = RESPONSE_TARGET_HOURS[row.priority];
  const waited =
    row.firstResponseAt === null
      ? `sem resposta há ${formatMinutes(minutesBetween(row.createdAt, now))}`
      : `respondido em ${formatMinutes(minutesBetween(row.createdAt, row.firstResponseAt))}`;
  return {
    id: `late-${row.ticketId}`,
    title: caseTitle(row),
    detail: `Prioridade ${TICKET_PRIORITY_LABELS[row.priority].toLowerCase()}: ${waited} (prazo ${target}h).`,
    meta: `Aberto em ${dayFormatter.format(row.createdAt)}`,
    href: ticketHref(row.ticketId),
  };
}

function reopenedCase(row: ResolutionRow): ReportCase {
  return {
    id: `reopened-${row.ticketId}-${row.closedAt.toISOString()}`,
    title: caseTitle(row),
    detail: "Voltou em até 7 dias depois de encerrado.",
    meta: `Encerrado em ${dayFormatter.format(row.closedAt)}`,
    href: ticketHref(row.ticketId),
  };
}

export function adminCases(period: PeriodRows, now: Date): ReportCaseTab[] {
  const { current } = period;
  const reopened = current.resolutions
    .filter((row) => row.cameBack)
    .toSorted((first, second) => second.closedAt.getTime() - first.closedAt.getTime());
  return [
    tabOf("notas-baixas", "Notas baixas", lowRatings(current.ratings).map(lowRatingCase)),
    tabOf(
      "fora-do-prazo",
      "Fora do prazo",
      lateTickets(current.opened, now).map((row) => lateCase(row, now)),
    ),
    tabOf("reabertos", "Reabertos", reopened.map(reopenedCase)),
  ];
}

export function adminAttention(
  period: PeriodRows,
  queue: readonly QueueRow[],
): NonNullable<MonthlyReport["attention"]> {
  const { current } = period;
  return {
    title: "Pede atenção",
    items: [
      {
        label: "Atrasados agora",
        count: queue.filter((row) => row.overdue).length,
        base: baseOf(queue.length, "na fila"),
      },
      {
        label: "Reabertos",
        count: current.resolutions.filter((row) => row.cameBack).length,
        base: baseOf(current.resolutions.length, "encerrados"),
      },
      {
        label: "Notas baixas",
        count: lowRatings(current.ratings).length,
        base: baseOf(current.ratings.length, "notas"),
      },
      {
        label: "Sem resposta",
        count: current.opened.filter((row) => row.firstResponseAt === null).length,
        base: baseOf(current.opened.length, "criados"),
      },
    ],
  };
}
