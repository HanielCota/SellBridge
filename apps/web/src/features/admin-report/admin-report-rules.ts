import { TICKET_PRIORITY_LABELS } from "@sellbridge/shared/schemas";
import { SUPPORT_HOURS } from "@sellbridge/shared/support-hours";
import {
  CAME_BACK_WINDOW_DAYS,
  ON_TIME_NEEDS_SUPPORT_BELOW,
} from "@sellbridge/shared/support-performance";
import { RESPONSE_TARGET_HOURS, TICKET_PRIORITIES } from "@sellbridge/shared/ticket-rules";
import type { ReportRule, ReportTarget } from "@/features/report-kit/report-model";

/*
 * The rules behind the admin report, in plain words. They describe what the code does (the
 * "Desempenho" screen's rules in `@sellbridge/shared/support-performance`), not a wish.
 */

/** Share of first replies inside the deadline the team aims for: below it someone needs support. */
export const ON_TIME_TARGET: ReportTarget = { value: ON_TIME_NEEDS_SUPPORT_BELOW, kind: "min" };
/** The average rating the team aims for. */
export const RATING_TARGET: ReportTarget = { value: 4, kind: "min" };
/** A rating at or below this is a low one (the same cut as "Desempenho"). */
export const LOW_RATING_MAX = 3;

/** One sentence for the team card: who a close and a rating count for. */
export const CREDIT_RULE =
  "O encerramento e a nota contam para quem deu a última resposta ao cliente antes de encerrar.";

const CREDIT_RULE_DETAIL = [
  "O encerramento conta para quem deu a última resposta ao cliente antes de encerrar, mesmo que outra pessoa tenha clicado em encerrar.",
  "Num chamado transferido, conta para quem respondeu por último; se ninguém da equipe respondeu desde o encerramento anterior, não conta para ninguém.",
  "A nota vai para a mesma pessoa do encerramento avaliado, e a primeira resposta para quem respondeu primeiro.",
].join(" ");

function deadlinesText(): string {
  const deadlines = TICKET_PRIORITIES.toReversed()
    .map((priority) => `${TICKET_PRIORITY_LABELS[priority]} ${RESPONSE_TARGET_HOURS[priority]}h`)
    .join(", ");
  const target = Math.round(ON_TIME_TARGET.value * 100);
  return `${deadlines}, em horas corridas desde a abertura do chamado. Um chamado sem resposta conta como fora do prazo quando o prazo já passou. A meta é responder ao menos ${target}% no prazo.`;
}

/** "2026-10-01" → "01/10/2026". */
function brazilianDate(isoDate: string): string {
  return isoDate.split("-").toReversed().join("/");
}

export function adminReportRules(period: { fromDate: string; toDate: string }): ReportRule[] {
  const { opensAtHour, closesAtHour } = SUPPORT_HOURS;
  return [
    {
      title: "Período e fuso",
      text: `De ${brazilianDate(period.fromDate)} a ${brazilianDate(period.toDate)}, no horário de Brasília. Um chamado conta no período em que foi aberto; um encerramento e uma nota, no período em que aconteceram.`,
    },
    {
      title: "Horário de atendimento",
      text: `A equipe atende todos os dias, das ${opensAtHour}h às ${closesAtHour}h. O mapa "Quando chega" separa o que chega fora desse horário; o prazo ainda conta horas corridas.`,
    },
    { title: "Prazo da primeira resposta", text: deadlinesText() },
    { title: "Quem leva o crédito", text: CREDIT_RULE_DETAIL },
    {
      title: "Reaberto e retrabalho",
      text: `Conta como reaberto o encerramento que voltou em até ${CAME_BACK_WINDOW_DAYS} dias: o cliente reabriu, ou abriu de novo a mesma queixa sobre o mesmo pedido, loja ou anúncio. "Resolvidos sem reabrir" só olha encerramentos que já tiveram os ${CAME_BACK_WINDOW_DAYS} dias para voltar.`,
    },
    {
      title: "Mês fechado",
      text: "Quando o mês fecha, os números ficam guardados como estavam: um chamado reaberto ou uma nota dada depois não muda o relatório daquele mês.",
    },
  ];
}
