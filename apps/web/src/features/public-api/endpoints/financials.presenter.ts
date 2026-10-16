import type { SalesSummary } from "@sellbridge/database/repositories";
import type { ResolvedPeriod } from "@sellbridge/shared/period-range";
import { z } from "zod";
import { financialTotalsSchema, presentFinancialTotals } from "./financial-totals";

export const financialSummarySchema = z.object({
  period: z
    .object({
      from: z.iso.date().describe("Primeiro dia (horário de Brasília)."),
      to: z.iso.date().describe("Último dia, inclusive."),
    })
    .describe("Período considerado."),
  orders: z.number().int().describe("Pedidos que contam como venda."),
  cancelledOrders: z.number().int().describe("Pedidos cancelados ou devolvidos."),
  pendingCostOrders: z
    .number()
    .int()
    .describe("Vendas com custo pendente: entram na receita, mas não no lucro."),
  averageTicketCents: z
    .number()
    .int()
    .nullable()
    .describe("Receita média por pedido; null sem vendas."),
  totals: financialTotalsSchema,
});

export type FinancialSummaryDto = z.input<typeof financialSummarySchema>;

export function presentFinancialSummary(
  summary: SalesSummary,
  period: Pick<ResolvedPeriod, "fromDate" | "toDate">,
): FinancialSummaryDto {
  return {
    period: { from: period.fromDate, to: period.toDate },
    orders: summary.orders,
    cancelledOrders: summary.cancelledOrders,
    pendingCostOrders: summary.pendingCostOrders,
    averageTicketCents: summary.averageTicketCents,
    totals: presentFinancialTotals(summary),
  };
}
