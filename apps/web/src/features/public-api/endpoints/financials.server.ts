import { getSalesSummary } from "@sellbridge/database/repositories";
import { z } from "zod";
import { buildReportScope } from "@/features/reports/report-scope.server";
import { database } from "@/lib/server/database";
import { dataEnvelope, defineApiEndpoint, noInput } from "../endpoint";
import { financialSummarySchema, presentFinancialSummary } from "./financials.presenter";
import { periodQuerySchema, resolveApiPeriod } from "./query-params";

const summaryQuerySchema = periodQuerySchema.extend({
  storeId: z.uuid().optional().describe("Só vendas desta loja."),
});

export const getFinancialSummary = defineApiEndpoint({
  method: "GET",
  path: "/financials/summary",
  operationId: "getFinancialSummary",
  tag: "Financeiro",
  summary: "Resumo financeiro",
  description:
    "Totais do período (padrão: últimos 30 dias): pedidos, receita, custos, tarifas e lucro, com a mesma conta do painel financeiro.",
  scope: "financials:read",
  params: noInput,
  query: summaryQuerySchema,
  body: noInput,
  response: dataEnvelope(financialSummarySchema),
  handle: async ({ context, query }) => {
    const { search } = resolveApiPeriod(query, context.now);
    const { scope, period } = buildReportScope(
      context.tenantId,
      { ...search, store: query.storeId },
      context.now,
    );
    const summary = await getSalesSummary(database, scope);
    return { data: presentFinancialSummary(summary, period) };
  },
});
