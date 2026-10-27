import { MIN_HEALTH_ORDERS } from "@sellbridge/shared/supplier-panel-health";
import { MIN_REVIEWS_FOR_SCORE } from "@sellbridge/shared/supplier-score";
import {
  MONTHLY_REPORT_VERSION,
  type MonthlyReport,
  type ReportRule,
} from "@/features/report-kit/report-model";
import { supplierAttention, supplierCases } from "./supplier-report-cases";
import { supplierCharts } from "./supplier-report-charts";
import { supplierIndicators, windowFigures } from "./supplier-report-indicators";
import type { SupplierReportInput } from "./supplier-report-input";

function hoursLabel(hours: number): string {
  return `${hours} ${hours === 1 ? "hora" : "horas"}`;
}

/** How each number is counted, in the words the supplier reads on the page and on paper. */
export function supplierReportRules(supplier: SupplierReportInput["supplier"]): ReportRule[] {
  return [
    {
      title: "Período e fuso",
      text: "Dias inteiros no horário de Brasília. Um pedido conta no período em que chegou para você; o despacho conta no período em que o pedido saiu.",
    },
    {
      title: "Prazos de aceite e despacho",
      text: `Você tem ${hoursLabel(supplier.acceptWithinHours)} para aceitar e ${hoursLabel(supplier.dispatchWithinHours)} para despachar, contadas de quando o pedido chega. Quando o marketplace dá uma data de despacho, vale o dia inteiro dessa data.`,
    },
    {
      title: "Quem leva o cancelamento",
      text: 'Só conta como cancelado por você o pedido que você cancelou ("Não consigo enviar"). Cancelamento do revendedor ou do comprador não entra na sua conta. A taxa é sobre os pedidos concluídos: os que você despachou ou cancelou.',
    },
    {
      title: "Avaliações",
      text: "Cada nota conta no mês em que o revendedor avaliou, não no mês do pedido.",
    },
    {
      title: "Poucos dados",
      text: `Com menos de ${MIN_HEALTH_ORDERS} pedidos contados (ou ${MIN_REVIEWS_FOR_SCORE} avaliações), o número aparece com "poucos dados" e não é comparado com a meta: poucos casos dizem mais sobre sorte do que sobre o seu trabalho.`,
    },
    {
      title: "Mês fechado",
      text: "Depois que o mês acaba, os números dele ficam guardados e não mudam mais. O mês em andamento muda até o último dia.",
    },
  ];
}

/** The supplier's monthly report, from the records the server read. Pure: same input, same report. */
export function buildSupplierReport(input: SupplierReportInput): MonthlyReport {
  const current = windowFigures(input, input.period);
  const previous = windowFigures(input, input.period.previous);
  const empty =
    current.received.length === 0 && current.dispatched.length === 0 && current.ratings.count === 0;
  return {
    version: MONTHLY_REPORT_VERSION,
    title: "Relatório do fornecedor",
    itemNoun: "pedido",
    empty,
    indicators: supplierIndicators(input, current, previous),
    charts: supplierCharts(input, current),
    attention: supplierAttention(input, current),
    cases: supplierCases(input),
    team: null,
    rules: supplierReportRules(input.supplier),
  };
}
