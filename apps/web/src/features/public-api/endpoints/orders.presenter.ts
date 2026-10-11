import type { OrderDetail, OrderFinancialRow } from "@sellbridge/database/repositories";
import { computeOrderFinance } from "@sellbridge/shared/finance";
import { orderStatusSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { financialTotalsSchema, presentFinancialTotals } from "./financial-totals";

const orderBaseShape = {
  id: z.uuid(),
  externalOrderId: z.string().describe("Número do pedido no marketplace."),
  storeId: z.uuid().describe("Loja onde a venda aconteceu (veja `GET /stores`)."),
  storeName: z.string(),
  status: orderStatusSchema.describe(
    "`pending`, `paid`, `shipped`, `delivered`, `cancelled` ou `returned`.",
  ),
  buyerName: z.string().nullable(),
  orderedAt: z.iso.datetime(),
  deliveredAt: z.iso
    .datetime()
    .nullable()
    .describe("Quando o SellBridge viu o pedido como entregue; o marketplace não informa a data."),
  totals: financialTotalsSchema,
};

export const orderSummarySchema = z.object({
  ...orderBaseShape,
  itemsSummary: z.string().describe("Itens do pedido em uma linha, como `Camiseta (x2)`."),
});

export type OrderSummaryDto = z.input<typeof orderSummarySchema>;

const orderItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  unitCostCents: z.number().int(),
  listingId: z.uuid().nullable().describe("Anúncio do SellBridge que vendeu o item, se houver."),
  productId: z.uuid().nullable().describe("Produto do catálogo, se o item foi reconhecido."),
});

const orderAdjustmentSchema = z.object({
  id: z.uuid(),
  type: z
    .enum(["refund", "return", "commission"])
    .describe(
      "`refund`: reembolso ao comprador; `return`: devolução; `commission`: comissão do fornecedor.",
    ),
  amountCents: z.number().int().describe("Valor positivo; o tipo diz como afeta o lucro."),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const orderDetailSchema = z.object({
  ...orderBaseShape,
  items: z.array(orderItemSchema),
  adjustments: z.array(orderAdjustmentSchema),
});

export type OrderDetailDto = z.input<typeof orderDetailSchema>;

export function presentOrderSummary(row: OrderFinancialRow): OrderSummaryDto {
  return {
    id: row.id,
    externalOrderId: row.externalOrderId,
    storeId: row.storeConnectionId,
    storeName: row.storeName,
    // The column is an enum in the database, so this only fails if the two drift apart.
    status: orderStatusSchema.parse(row.status),
    buyerName: row.buyerName,
    orderedAt: row.orderedAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    totals: presentFinancialTotals(row),
    itemsSummary: row.items,
  };
}

/** Totals use the same formula as the reports, so a detail always matches its list row. */
export function presentOrderDetail(
  order: OrderDetail,
  platformFeeBasisPoints: number,
): OrderDetailDto {
  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    storeId: order.storeConnectionId,
    storeName: order.storeName,
    status: order.status,
    buyerName: order.buyerName,
    orderedAt: order.orderedAt.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    totals: presentFinancialTotals(computeOrderFinance(order, platformFeeBasisPoints)),
    items: order.items.map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      unitCostCents: item.unitCostCents,
      listingId: item.listingId,
      productId: item.productId,
    })),
    adjustments: order.adjustments.map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.type,
      amountCents: adjustment.amountCents,
      reason: adjustment.reason,
      createdAt: adjustment.createdAt.toISOString(),
    })),
  };
}
