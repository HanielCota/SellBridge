import type {
  OrderStatusCounts,
  SalesHeatmapCell,
  SalesSummary,
  SellerReportCase,
  SellerReportCaseKind,
  StoreBreakdown,
  TopProduct,
} from "@sellbridge/database/repositories";
import { baseOf, formatReportValue, rateOf } from "@/features/report-kit/report-format";
import {
  MONTHLY_REPORT_VERSION,
  type MonthlyReport,
  type ReportAttentionItem,
  type ReportIndicatorRow,
  type ReportMetricRow,
} from "@/features/report-kit/report-model";
import { sellerReportCases, sellerReportCharts, sellerReportRules } from "./seller-report-charts";

/*
 * The reseller's monthly report ("Relatório de vendas") from the numbers the repositories
 * already give the dashboard and the financial page. Pure: the server function loads, this
 * assembles, so the same numbers always make the same report.
 */

export interface SellerPeriodNumbers {
  summary: SalesSummary;
  statuses: OrderStatusCounts;
  byStore: readonly StoreBreakdown[];
  topProducts: readonly TopProduct[];
}

export interface SellerTrendMonth {
  /** `YYYY-MM`. */
  month: string;
  orders: number;
  profitCents: number;
}

export interface SellerReportInput {
  current: SellerPeriodNumbers;
  previous: SellerPeriodNumbers;
  /** Oldest first, the period's month last. */
  trend: readonly SellerTrendMonth[];
  heatmap: readonly SalesHeatmapCell[];
  cases: Record<SellerReportCaseKind, { total: number; items: readonly SellerReportCase[] }>;
  /** The SellBridge fee over each sale, in basis points (250 = 2,5%). */
  platformFeeBasisPoints: number;
}

/** Every order placed in the period, sale or not (unpaid, cancelled, returned). */
export function allOrdersOf(statuses: OrderStatusCounts): number {
  return Object.values(statuses).reduce((total, orders) => total + orders, 0);
}

/** Profit over the revenue of priced sales: sales of unknown cost are in neither. */
export function marginOf(summary: SalesSummary): number | null {
  return rateOf(summary.profitCents, summary.revenueCents - summary.pendingCostRevenueCents);
}

function plural(amount: number, singular: string, pluralWord: string): string {
  return amount === 1 ? singular : pluralWord;
}

function metric(row: Partial<ReportMetricRow> & Pick<ReportMetricRow, "label">): ReportMetricRow {
  return {
    kind: "metric",
    base: null,
    count: null,
    countFormat: "count",
    rate: null,
    rateFormat: "rate",
    previous: null,
    target: null,
    sense: "neutral",
    indent: false,
    ...row,
  };
}

function orderRows(input: SellerReportInput): ReportIndicatorRow[] {
  const { current, previous } = input;
  const all = allOrdersOf(current.statuses);
  const previousAll = allOrdersOf(previous.statuses);
  const ordersBase = baseOf(all, plural(all, "pedido", "pedidos"));
  const problem = (label: string, key: "cancelled" | "returned" | "pending") =>
    metric({
      label,
      base: ordersBase,
      count: current.statuses[key],
      rate: rateOf(current.statuses[key], all),
      previous: rateOf(previous.statuses[key], previousAll),
      sense: key === "pending" ? "neutral" : "lower_is_better",
      indent: true,
    });
  return [
    { kind: "group", label: `Pedidos do período · ${all}`, note: null },
    metric({
      label: "Vendas",
      base: "pagos, enviados ou entregues",
      count: current.summary.orders,
      previous: previous.summary.orders,
      sense: "higher_is_better",
    }),
    problem("Cancelados", "cancelled"),
    problem("Devolvidos", "returned"),
    problem("Aguardando pagamento", "pending"),
  ];
}

function moneyRows(input: SellerReportInput): ReportIndicatorRow[] {
  const { summary } = input.current;
  const previous = input.previous.summary;
  const pending = summary.pendingCostOrders;
  const pricedRevenue = summary.revenueCents - summary.pendingCostRevenueCents;
  const profitBase =
    pending === 0
      ? "receita menos custo, taxas e reembolsos"
      : `sem ${pending} ${plural(pending, "venda", "vendas")} de custo pendente`;
  return [
    { kind: "group", label: "Dinheiro das vendas", note: "cancelados e devolvidos não entram" },
    metric({
      label: "Receita",
      count: summary.revenueCents,
      countFormat: "cents",
      previous: previous.revenueCents,
      sense: "higher_is_better",
    }),
    metric({
      label: "Lucro",
      base: profitBase,
      count: summary.profitCents,
      countFormat: "cents",
      previous: previous.profitCents,
      sense: "higher_is_better",
    }),
    metric({
      label: "Margem",
      base: `sobre ${formatReportValue(pricedRevenue, "cents")} de receita com custo conhecido`,
      rate: marginOf(summary),
      previous: marginOf(previous),
      sense: "higher_is_better",
      indent: true,
    }),
    metric({
      label: "Ticket médio",
      base: baseOf(summary.orders, plural(summary.orders, "venda", "vendas")),
      count: summary.averageTicketCents,
      countFormat: "cents",
      previous: previous.averageTicketCents,
      sense: "higher_is_better",
    }),
    metric({
      label: "Custo pendente",
      base: baseOf(summary.orders, plural(summary.orders, "venda", "vendas")),
      count: pending,
      rate: rateOf(pending, summary.orders),
      previous: rateOf(previous.pendingCostOrders, previous.orders),
      sense: "lower_is_better",
    }),
  ];
}

function attentionOf(input: SellerReportInput): MonthlyReport["attention"] {
  const { statuses, summary } = input.current;
  const all = allOrdersOf(statuses);
  const items: ReportAttentionItem[] = [
    {
      label: "Cancelados",
      count: statuses.cancelled,
      base: baseOf(all, plural(all, "pedido", "pedidos")),
    },
    {
      label: "Devolvidos",
      count: statuses.returned,
      base: baseOf(all, plural(all, "pedido", "pedidos")),
    },
    {
      label: "Custo pendente",
      count: summary.pendingCostOrders,
      base: baseOf(summary.orders, plural(summary.orders, "venda", "vendas")),
    },
  ];
  if (items.every((item) => item.count === 0)) {
    return null;
  }
  return { title: "O que precisa de atenção", items };
}

export function buildSellerReport(input: SellerReportInput): MonthlyReport {
  return {
    version: MONTHLY_REPORT_VERSION,
    title: "Relatório de vendas",
    itemNoun: "pedido",
    empty: allOrdersOf(input.current.statuses) === 0,
    indicators: [...orderRows(input), ...moneyRows(input)],
    charts: sellerReportCharts(input),
    attention: attentionOf(input),
    cases: sellerReportCases(input.cases),
    team: null,
    rules: sellerReportRules(input.platformFeeBasisPoints),
  };
}
