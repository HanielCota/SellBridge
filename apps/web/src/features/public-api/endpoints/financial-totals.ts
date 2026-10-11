import { z } from "zod";

/** Money of an order, or of a period: the same names in every public response. */
export const financialTotalsSchema = z.object({
  revenueCents: z
    .number()
    .int()
    .describe("Receita (valor pago pelo comprador). Zero em pedidos cancelados ou devolvidos."),
  costCents: z.number().int().describe("Custo dos produtos no fornecedor."),
  marketplaceFeeCents: z.number().int().describe("Tarifa cobrada pelo marketplace."),
  refundsCents: z.number().int().describe("Reembolsos ao comprador."),
  returnsCents: z
    .number()
    .int()
    .describe("Valor devolvido em devoluções; informativo, já fora da receita."),
  commissionsCents: z.number().int().describe("Comissões recebidas do fornecedor."),
  platformFeeCents: z.number().int().describe("Taxa do SellBridge."),
  profitCents: z
    .number()
    .int()
    .describe(
      "Lucro: receita − custo − tarifa do marketplace − reembolsos + comissões − taxa do SellBridge.",
    ),
});

export type FinancialTotalsDto = z.input<typeof financialTotalsSchema>;

/** The shape every finance computation of the app returns, order or period alike. */
export interface FinanceFigures {
  revenueCents: number;
  costCents: number;
  feeCents: number;
  refundCents: number;
  returnCents: number;
  commissionCents: number;
  platformFeeCents: number;
  profitCents: number;
}

export function presentFinancialTotals(figures: FinanceFigures): FinancialTotalsDto {
  return {
    revenueCents: figures.revenueCents,
    costCents: figures.costCents,
    marketplaceFeeCents: figures.feeCents,
    refundsCents: figures.refundCents,
    returnsCents: figures.returnCents,
    commissionsCents: figures.commissionCents,
    platformFeeCents: figures.platformFeeCents,
    profitCents: figures.profitCents,
  };
}
