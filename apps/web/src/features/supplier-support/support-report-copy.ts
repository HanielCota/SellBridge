import type { Share, SupplierSupportReport } from "@sellbridge/shared/supplier-support-report";
import { formatMinutes } from "@/features/report-kit/report-format";
import { EMPTY_FIGURE } from "@/features/support/performance-format";
import { formatPercent } from "@/lib/percent";

/*
 * The words of the supplier's answering report: each figure with the sentence that says what it
 * counts, so no number is left on its own.
 */

const count = new Intl.NumberFormat("pt-BR");
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function amount(value: number, one: string, other: string): string {
  return `${count.format(value)} ${value === 1 ? one : other}`;
}

export interface WaitingCopy {
  headline: string;
  detail: string;
  /** "1 passou de 1 dia útil"; null when none is late. */
  late: string | null;
}

/** What waits for the supplier right now, and since when. */
export function waitingCopy(waiting: SupplierSupportReport["waiting"]): WaitingCopy {
  if (waiting.count === 0 || waiting.oldestSince === null) {
    return {
      headline: "Nenhuma conversa espera sua resposta",
      detail: "Quando uma loja escrever, a conversa aparece em A fazer.",
      late: null,
    };
  }
  const verb = waiting.count === 1 ? "espera" : "esperam";
  return {
    headline: `${amount(waiting.count, "conversa", "conversas")} ${verb} sua resposta`,
    detail: `A mais antiga espera desde ${dayMonth.format(waiting.oldestSince)}.`,
    late:
      waiting.late === 0
        ? null
        : `${count.format(waiting.late)} ${waiting.late === 1 ? "passou" : "passaram"} de 1 dia útil`,
  };
}

export interface FigureCopy {
  figure: string;
  detail: string;
}

export function receivedCopy(report: SupplierSupportReport): FigureCopy {
  return {
    figure: count.format(report.received.current),
    detail: `${count.format(report.received.previous)} nos ${report.days} dias anteriores`,
  };
}

export function firstResponseCopy(report: SupplierSupportReport): FigureCopy {
  if (report.firstResponseMinutes === null) {
    return { figure: EMPTY_FIGURE, detail: "Nenhuma resposta no período" };
  }
  return {
    figure: formatMinutes(report.firstResponseMinutes),
    detail: "Tempo típico até você responder a loja",
  };
}

export function onTimeCopy(share: Share): FigureCopy {
  if (share.of === 0) {
    return { figure: EMPTY_FIGURE, detail: "Nenhuma resposta venceu no período" };
  }
  return {
    figure: formatPercent(share.count / share.of),
    detail: `${count.format(share.count)} de ${amount(share.of, "conversa", "conversas")}`,
  };
}

export function finishedCopy(finished: SupplierSupportReport["finished"]): FigureCopy {
  if (finished.total === 0) {
    return { figure: "0", detail: "Nenhuma conversa finalizada no período" };
  }
  const parts = [
    `${count.format(finished.supplier)} por você`,
    `${count.format(finished.store)} pela loja`,
    `${count.format(finished.automatic)} ${finished.automatic === 1 ? "sozinha" : "sozinhas"}`,
  ];
  return { figure: count.format(finished.total), detail: parts.join(" · ") };
}

export function cameBackCopy(share: Share): FigureCopy {
  if (share.of === 0) {
    return { figure: "0", detail: "Nenhuma conversa finalizada no período" };
  }
  return {
    figure: count.format(share.count),
    detail: `de ${amount(share.of, "finalizada", "finalizadas")}`,
  };
}

/** A subject's "came back" cell: "1 de 4", or a dash when nothing of it was finished. */
export function subjectCameBackText(share: Share): string {
  return share.of === 0
    ? EMPTY_FIGURE
    : `${count.format(share.count)} de ${count.format(share.of)}`;
}

export function subjectFirstResponseText(minutes: number | null): string {
  return minutes === null ? EMPTY_FIGURE : formatMinutes(minutes);
}
