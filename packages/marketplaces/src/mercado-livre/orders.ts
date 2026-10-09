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

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function mapMercadoLivreOrder(raw: MercadoLivreOrder): MarketplaceOrder {
  return {
    externalOrderId: String(raw.id),
    status: ORDER_STATUS_MAP[raw.status] ?? "pending",
    totalCents: toCents(raw.total_amount),
    // TODO(sale-fee): the docs only show quantity 1; confirm whether sale_fee is per unit.
    marketplaceFeeCents: raw.order_items.reduce(
      (total, line) => total + toCents((line.sale_fee ?? 0) * line.quantity),
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
