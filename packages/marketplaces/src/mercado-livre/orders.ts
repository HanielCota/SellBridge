import { logger } from "@sellbridge/shared/logger";
import { marketplaceError } from "../errors.ts";
import type { MarketplaceOrder, StoreCredentials } from "../types.ts";
import { type MercadoLivreContext, requestJson } from "./client.ts";
import { type MercadoLivreOrder, orderSchema, ordersSearchSchema } from "./schemas.ts";

const ORDERS_PAGE_SIZE = 50;
/** Stops paginating order searches after this many results. */
const MAX_ORDERS_FETCHED = 1000;

const ORDER_STATUS_MAP: Record<string, MarketplaceOrder["status"]> = {
  confirmed: "pending",
  payment_required: "pending",
  payment_in_process: "pending",
  partially_paid: "pending",
  paid: "paid",
  partially_refunded: "paid",
  pending_cancel: "cancelled",
  cancelled: "cancelled",
  invalid: "cancelled",
};

/**
 * Mercado Livre's order status, read with the tags that change what we may do with it:
 * `fraud_risk_detected` means "do not ship", so the order is held as unpaid and never reaches
 * the supplier. Statuses from the gerenciamento-de-vendas table; an unknown one is held too.
 */
function orderStatus(raw: MercadoLivreOrder): MarketplaceOrder["status"] {
  const status = ORDER_STATUS_MAP[raw.status];
  if (status === undefined) {
    logger.warn("mercado_livre.unknown_order_status", {
      externalOrderId: String(raw.id),
      status: raw.status,
    });
    return "pending";
  }
  if (status === "paid" && raw.tags?.includes("fraud_risk_detected")) return "pending";
  return status;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function mapMercadoLivreOrder(raw: MercadoLivreOrder): MarketplaceOrder {
  return {
    externalOrderId: String(raw.id),
    status: orderStatus(raw),
    totalCents: toCents(raw.total_amount),
    // Official "Provisões" docs: sale_fee is per unit; do not add fixed fees again.
    marketplaceFeeCents: raw.order_items.reduce(
      // Rounded once per line, not per unit: a fee with more than two decimals would
      // otherwise drift by up to half a cent times the quantity.
      (total, line) => total + toCents((line.sale_fee ?? 0) * line.quantity),
      0,
    ),
    // Each payment says how much of it went back (`transaction_amount_refunded`).
    refundedCents: (raw.payments ?? []).reduce(
      (total, payment) => total + toCents(payment.transaction_amount_refunded ?? 0),
      0,
    ),
    buyerName: raw.buyer?.nickname ?? null,
    orderedAt: new Date(raw.date_created),
    items: raw.order_items.map((line) => ({
      externalListingId: line.item.id,
      title: line.item.title,
      quantity: line.quantity,
      unitPriceCents: toCents(line.unit_price),
    })),
  };
}

async function fetchOrdersPage(
  context: MercadoLivreContext,
  page: { store: StoreCredentials; since: Date; offset: number },
) {
  const query = new URLSearchParams({
    seller: page.store.externalShopId,
    "order.date_created.from": page.since.toISOString(),
    sort: "date_desc",
    offset: String(page.offset),
    limit: String(ORDERS_PAGE_SIZE),
  });
  return requestJson(context, {
    schema: ordersSearchSchema,
    path: `/orders/search?${query.toString()}`,
    init: { accessToken: page.store.accessToken },
  });
}

export async function listOrders(
  context: MercadoLivreContext,
  store: StoreCredentials,
  since: Date,
): Promise<MarketplaceOrder[]> {
  const orders: MarketplaceOrder[] = [];
  for (let offset = 0; offset < MAX_ORDERS_FETCHED; offset += ORDERS_PAGE_SIZE) {
    const page = await fetchOrdersPage(context, { store, since, offset });
    orders.push(...page.results.map(mapMercadoLivreOrder));
    const total = page.paging?.total ?? 0;
    if (page.results.length === 0 || offset + ORDERS_PAGE_SIZE >= total) {
      return orders;
    }
  }
  return orders;
}

export async function fetchOrder(
  context: MercadoLivreContext,
  store: StoreCredentials,
  resource: string,
): Promise<MarketplaceOrder> {
  const match = /^\/?orders\/(\d+)$/.exec(resource);
  if (!match?.[1]) {
    throw marketplaceError(`Recurso de pedido inválido: ${resource}`, { retryable: false });
  }
  const raw = await requestJson(context, {
    schema: orderSchema,
    path: `/orders/${match[1]}`,
    init: { accessToken: store.accessToken },
  });
  return mapMercadoLivreOrder(raw);
}
