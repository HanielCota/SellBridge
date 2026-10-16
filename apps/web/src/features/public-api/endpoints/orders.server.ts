import { getOrderDetail, listOrderFinancials } from "@sellbridge/database/repositories";
import {
  FINANCIAL_SORTS,
  ORDER_STAGE_STATUSES,
  orderStageSchema,
  orderStatusSchema,
  type OrderStage,
  type OrderStatus,
} from "@sellbridge/shared/schemas";
import { freeText } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { buildReportScope } from "@/features/reports/report-scope.server";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import {
  dataEnvelope,
  defineApiEndpoint,
  noInput,
  pageEnvelope,
  pageQuerySchema,
  toPaginationMeta,
} from "../endpoint";
import {
  orderDetailSchema,
  orderSummarySchema,
  presentOrderDetail,
  presentOrderSummary,
} from "./orders.presenter";
import { periodQuerySchema, resolveApiPeriod } from "./query-params";

const ordersQuerySchema = pageQuerySchema.extend(periodQuerySchema.shape).extend({
  storeId: z.uuid().optional().describe("Só pedidos desta loja."),
  status: orderStatusSchema
    .optional()
    .describe("Só pedidos neste status. Tem prioridade sobre `stage`."),
  stage: orderStageSchema
    .optional()
    .describe(
      "Etapa do pedido: `open` (pending e paid), `shipping` (shipped), `done` (delivered) ou `issue` (cancelled e returned).",
    ),
  // Same cleanup as every typed text: no control characters, and "É" in one form only.
  search: freeText()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("Busca no número do pedido, no nome do comprador e nos itens."),
  sort: z.enum(FINANCIAL_SORTS).default("orderedAt").describe("Campo de ordenação."),
  direction: z.enum(["asc", "desc"]).default("desc").describe("Direção da ordenação."),
});

function statusesFor(
  status: OrderStatus | undefined,
  stage: OrderStage | undefined,
): readonly OrderStatus[] | undefined {
  if (status !== undefined) {
    return [status];
  }
  return stage === undefined ? undefined : ORDER_STAGE_STATUSES[stage];
}

export const listOrders = defineApiEndpoint({
  method: "GET",
  path: "/orders",
  operationId: "listOrders",
  tag: "Pedidos",
  summary: "Listar pedidos",
  description:
    "Pedidos feitos no período (padrão: últimos 30 dias), cada um com receita, custos, tarifas e lucro.",
  scope: "orders:read",
  params: noInput,
  query: ordersQuerySchema,
  body: noInput,
  response: pageEnvelope(orderSummarySchema),
  handle: async ({ context, query }) => {
    const { search } = resolveApiPeriod(query, context.now);
    const { scope } = buildReportScope(
      context.tenantId,
      { ...search, store: query.storeId },
      context.now,
    );
    const page = await listOrderFinancials(database, scope, {
      filters: { statuses: statusesFor(query.status, query.stage), search: query.search },
      sort: { field: query.sort, direction: query.direction },
      pagination: { page: query.page, pageSize: query.pageSize },
    });
    return { data: page.items.map(presentOrderSummary), pagination: toPaginationMeta(page) };
  },
});

export const getOrder = defineApiEndpoint({
  method: "GET",
  path: "/orders/{orderId}",
  operationId: "getOrder",
  tag: "Pedidos",
  summary: "Ver um pedido",
  description: "Um pedido com seus itens, ajustes (reembolsos, devoluções e comissões) e totais.",
  scope: "orders:read",
  params: z.object({ orderId: z.uuid().describe("Id do pedido no SellBridge.") }),
  query: noInput,
  body: noInput,
  response: dataEnvelope(orderDetailSchema),
  handle: async ({ context, params }) => {
    const order = await getOrderDetail(database, context.tenantId, params.orderId);
    return { data: presentOrderDetail(order, environment.PLATFORM_FEE_BASIS_POINTS) };
  },
});
