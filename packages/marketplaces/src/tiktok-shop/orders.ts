import { MAX_STORED_CENTS } from "@sellbridge/shared/money";
import { logger } from "@sellbridge/shared/logger";
import { marketplaceError } from "../errors.ts";
import type { MarketplaceOrder, MarketplaceOrderItem, StoreCredentials } from "../types.ts";
import { requestShop, type TikTokShopContext } from "./client.ts";
import { orderDetailSchema, orderSearchSchema, type TikTokShopOrder } from "./schemas.ts";
import { shopCipher } from "./shops.ts";

/** Get Order List takes 1 to 100 per page. */
const ORDERS_PAGE_SIZE = 50;
/** Stops paginating order searches after this many results, like the Mercado Livre connector. */
const MAX_ORDERS_FETCHED = 1000;
const CURRENCY = "BRL";

/** Order statuses of Get Order Detail; an unknown one is held as pending. */
const ORDER_STATUS_MAP: Readonly<Record<string, MarketplaceOrder["status"]>> = {
  UNPAID: "pending",
  // The buyer may still cancel without the seller's approval: not ready to ship.
  ON_HOLD: "pending",
  AWAITING_SHIPMENT: "paid",
  PARTIALLY_SHIPPING: "paid",
  AWAITING_COLLECTION: "paid",
  IN_TRANSIT: "shipped",
  DELIVERED: "delivered",
  COMPLETED: "delivered",
  CANCELLED: "cancelled",
};

function orderStatus(raw: TikTokShopOrder): MarketplaceOrder["status"] {
  const status = Object.hasOwn(ORDER_STATUS_MAP, raw.status)
    ? ORDER_STATUS_MAP[raw.status]
    : undefined;
  if (status === undefined) {
    logger.warn("tiktok_shop.unknown_order_status", {
      externalOrderId: raw.id,
      status: raw.status,
    });
    return "pending";
  }
  return status;
}

const DECIMAL_AMOUNT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;

/** "59.9" → 5990, read digit by digit so no float rounding touches money. */
export function amountToCents(amount: string, field: string): number {
  const match = DECIMAL_AMOUNT.exec(amount.trim());
  if (match === null) {
    throw marketplaceError(
      `Pedido do TikTok Shop com ${field} fora do formato: "${amount.slice(0, 20)}"`,
      {
        retryable: false,
      },
    );
  }
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_STORED_CENTS) {
    throw marketplaceError(`Pedido do TikTok Shop com ${field} acima do armazenável: ${amount}`, {
      retryable: false,
    });
  }
  return cents;
}

/**
 * Each line item is one unit (Get Order Detail has no quantity), so the units of a SKU are
 * counted. The unit price is the item's `sale_price`.
 */
function orderItems(raw: TikTokShopOrder): MarketplaceOrderItem[] {
  const items = new Map<string, MarketplaceOrderItem>();
  for (const unit of raw.line_items) {
    const key = `${unit.product_id}:${unit.sku_id}`;
    const counted = items.get(key);
    items.set(key, {
      externalListingId: unit.product_id,
      title: unit.product_name,
      quantity: (counted?.quantity ?? 0) + 1,
      unitPriceCents: counted?.unitPriceCents ?? amountToCents(unit.sale_price, "preço do item"),
    });
  }
  return [...items.values()];
}

/**
 * A TikTok Shop order in SellBridge's shape. The seller fee is not part of the order (it comes
 * with the settlement, Finance API), so it is 0 here. [live test] how to bring the fee in. The
 * address is not read: TikTok masks it on platform-shipped orders, which ship with its label.
 */
export function mapTikTokShopOrder(raw: TikTokShopOrder): MarketplaceOrder {
  if (raw.payment.currency !== CURRENCY) {
    throw marketplaceError(
      `Pedido do TikTok Shop em outra moeda: ${raw.payment.currency.slice(0, 10)}`,
      {
        retryable: false,
      },
    );
  }
  const orderedAt = new Date(raw.create_time * 1000);
  if (Number.isNaN(orderedAt.getTime())) {
    throw marketplaceError("Pedido do TikTok Shop sem data válida", { retryable: false });
  }
  return {
    externalOrderId: raw.id,
    status: orderStatus(raw),
    totalCents: amountToCents(raw.payment.total_amount, "total"),
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt,
    items: orderItems(raw),
  };
}

async function fetchOrdersPage(
  context: TikTokShopContext,
  page: { store: StoreCredentials; cipher: string; since: Date; pageToken: string | null },
) {
  return requestShop(context, {
    schema: orderSearchSchema,
    method: "POST",
    path: "/order/202309/orders/search",
    accessToken: page.store.accessToken,
    shopCipher: page.cipher,
    query: {
      page_size: String(ORDERS_PAGE_SIZE),
      sort_field: "create_time",
      sort_order: "DESC",
      ...(page.pageToken === null ? {} : { page_token: page.pageToken }),
    },
    json: { create_time_ge: Math.floor(page.since.getTime() / 1000) },
  });
}

/** Orders created since `since`, newest first, up to MAX_ORDERS_FETCHED. */
export async function listOrders(
  context: TikTokShopContext,
  store: StoreCredentials,
  since: Date,
): Promise<MarketplaceOrder[]> {
  const cipher = await shopCipher(context, store);
  const orders: MarketplaceOrder[] = [];
  let pageToken: string | null = null;
  while (orders.length < MAX_ORDERS_FETCHED) {
    const page = await fetchOrdersPage(context, { store, cipher, since, pageToken });
    orders.push(...(page.orders ?? []).map(mapTikTokShopOrder));
    const next = page.next_page_token ?? "";
    if (next === "" || (page.orders ?? []).length === 0) {
      return orders;
    }
    pageToken = next;
  }
  return orders.slice(0, MAX_ORDERS_FETCHED);
}

async function readOrder(
  context: TikTokShopContext,
  store: StoreCredentials,
  orderId: string,
): Promise<TikTokShopOrder> {
  const detail = await requestShop(context, {
    schema: orderDetailSchema,
    method: "GET",
    path: "/order/202507/orders",
    accessToken: store.accessToken,
    shopCipher: await shopCipher(context, store),
    query: { ids: orderId },
  });
  const order = detail.orders.find((candidate) => candidate.id === orderId);
  if (order === undefined) {
    throw marketplaceError(`Pedido ${orderId.slice(0, 64)} não encontrado no TikTok Shop`, {
      retryable: false,
    });
  }
  return order;
}

/** Loads the order a webhook pointed at; `resource` is the TikTok order id. */
export async function fetchOrder(
  context: TikTokShopContext,
  store: StoreCredentials,
  resource: string,
): Promise<MarketplaceOrder> {
  return mapTikTokShopOrder(await readOrder(context, store, resource));
}

/** The package ids of an order, for the shipping label. */
export async function orderPackageIds(
  context: TikTokShopContext,
  store: StoreCredentials,
  orderId: string,
): Promise<string[]> {
  const order = await readOrder(context, store, orderId);
  return (order.packages ?? []).map((pkg) => pkg.id);
}
