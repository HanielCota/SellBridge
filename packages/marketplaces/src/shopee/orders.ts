import { BRAZILIAN_STATE_NAMES } from "@sellbridge/shared/brazilian-states";
import { logger } from "@sellbridge/shared/logger";
import { MAX_STORED_CENTS } from "@sellbridge/shared/money";
import { z } from "zod";
import { isFinalMarketplaceAnswer, marketplaceError } from "../errors.ts";
import { readableOrders } from "../readable-orders.ts";
import { shippingAddressReading } from "../shipping-address.ts";
import type { MarketplaceOrder, MarketplaceOrderBatch, StoreCredentials } from "../types.ts";
import { requestShop, type ShopeeContext } from "./client.ts";

const orderNumber = z.string().regex(/^[A-Z0-9]{1,40}$/i);
const timestamp = z.number().int().nonnegative().max(253_402_300_799);
const amount = z
  .number()
  .nonnegative()
  .max(MAX_STORED_CENTS / 100);
/** Escrow lines may be negative: an adjustment or a rebate credits the seller. */
const signedAmount = z
  .number()
  .min(-MAX_STORED_CENTS / 100)
  .max(MAX_STORED_CENTS / 100);
const itemId = z.number().int().positive();
const recipientSchema = z.object({
  name: z.string().optional(),
  full_address: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  town: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipcode: z.string().optional(),
});

const orderSchema = z.object({
  order_sn: orderNumber,
  currency: z.literal("BRL"),
  order_status: z.string(),
  create_time: timestamp,
  recipient_address: z.unknown().optional(),
  item_list: z
    .array(
      z.object({
        item_id: itemId,
        model_id: z.number().int().nonnegative().default(0),
        item_name: z.string().min(1),
        model_name: z.string().optional(),
        model_quantity_purchased: z.number().int().positive(),
        model_original_price: amount,
        model_discounted_price: amount.nullish(),
      }),
    )
    .min(1),
});

const packageOrderSchema = z.object({
  order_sn: orderNumber,
  order_status: z.string(),
  split_up: z.boolean().optional(),
  package_list: z
    .array(
      z.object({
        package_number: z.string().min(1).max(60),
        logistics_status: z.string().optional(),
      }),
    )
    .optional(),
});

const orderDetailSchema = z.object({ order_list: z.array(z.unknown()) });
const orderListSchema = z.object({
  order_list: z.array(z.object({ order_sn: orderNumber })),
  more: z.boolean(),
  next_cursor: z.string().optional(),
});

const escrowSchema = z.array(z.unknown());
const escrowRowSchema = z.object({
  escrow_detail: z
    .object({
      order_sn: orderNumber,
      order_income: z
        .object({
          commission_fee: signedAmount.optional(),
          service_fee: signedAmount.optional(),
          seller_transaction_fee: signedAmount.optional(),
          seller_order_processing_fee: signedAmount.optional(),
          order_ams_commission_fee: signedAmount.optional(),
          /** What the buyer finally paid for the items, without shipping (bundle deals included). */
          cost_of_goods_sold: signedAmount.optional(),
        })
        .optional(),
    })
    .optional(),
});

const orderStatuses: Readonly<Record<string, MarketplaceOrder["status"]>> = {
  UNPAID: "pending",
  PENDING: "pending",
  READY_TO_SHIP: "paid",
  PROCESSED: "paid",
  RETRY_SHIP: "paid",
  INVOICE_PENDING: "paid",
  PENDING_INVOICE: "paid",
  SHIPPED: "shipped",
  TO_CONFIRM_RECEIVE: "delivered",
  COMPLETED: "delivered",
  CANCELLED: "cancelled",
};

const LIST_PAGE_SIZE = 100;
const DETAIL_PAGE_SIZE = 50;
const ESCROW_PAGE_SIZE = 20;
const MAX_BATCH_ORDERS = 1_000;
const MAX_LIST_PAGES_PER_WINDOW = 100;
const WINDOW_SECONDS = 15 * 24 * 60 * 60;
const ORDER_FIELDS = "item_list,recipient_address";
const unresolvedOrderStatus = z.enum(["IN_CANCEL", "TO_RETURN"]);
const unresolvedOrder = z.object({ order_status: unresolvedOrderStatus });

interface OrderWindow {
  field: "create_time" | "update_time";
  from: number;
  to: number;
}

export function parseSerial(serial: string): string {
  if (!orderNumber.safeParse(serial).success) {
    throw marketplaceError("Número de pedido inválido para a Shopee.", { retryable: false });
  }

  return serial;
}

/** Cents that must fit the integer cents columns they are stored in. */
function withinStoredLimit(cents: number, field: string): number {
  if (cents > MAX_STORED_CENTS) {
    // Final, not retryable: reading the order again returns the same amount.
    throw marketplaceError(
      `Pedido da Shopee com ${field} acima do valor que o SellBridge guarda.`,
      {
        retryable: false,
      },
    );
  }
  return cents;
}

/** An amount, or a sum of amounts, in cents that fit the columns it is stored in. */
function storedCents(value: number, field: string): number {
  return withinStoredLimit(Math.round(value * 100), field);
}

/** One unit's price: Shopee reports 0 as the discounted price of a bundle deal item. */
function unitPrice(item: {
  model_original_price: number;
  model_discounted_price?: number | null | undefined;
}) {
  const discounted = item.model_discounted_price;
  return discounted === undefined || discounted === null || discounted === 0
    ? item.model_original_price
    : discounted;
}

interface EscrowIncome {
  feeCents?: number | undefined;
  /** What the buyer paid for the items, without the shipping (`cost_of_goods_sold`). */
  itemsTotalCents?: number | undefined;
}

function fold(text: string): string {
  return text
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

/**
 * Shopee hides the buyer's name from shops of individual sellers (CPF) and masks it with
 * asterisks, while still sending the address; the parcel's label carries the real recipient.
 */
const MASKED_RECIPIENT_NAME = "Comprador Shopee";

function buyerNameOf(name: string | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (trimmed === "" || trimmed.includes("*")) {
    return null;
  }
  return trimmed.slice(0, 120);
}

function readRecipient(raw: unknown) {
  const parsed = recipientSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const address = parsed.data;
  const parts = address.full_address?.split(",").map((part) => part.trim()) ?? [];
  const numberFromText = /^(?:\d+[a-z]?|s\/?n)$/i.test(parts[1] ?? "") ? parts[1] : undefined;
  const region = fold(address.state ?? "");
  const uf = Object.entries(BRAZILIAN_STATE_NAMES).find(
    ([code, name]) => region === code || region === fold(name),
  )?.[0];
  const reading = shippingAddressReading({
    recipient: buyerNameOf(address.name) ?? MASKED_RECIPIENT_NAME,
    street: address.street || parts[0],
    number: address.number || numberFromText,
    complement: address.complement ?? "",
    neighborhood: address.district || address.town || "",
    city: address.city,
    state: uf,
    postalCode: address.zipcode,
  });
  return reading.kind === "available" ? reading.address : null;
}

/**
 * The sale's value is what the buyer pays for the items, as with the other marketplaces: Shopee's
 * `total_amount` also carries the shipping the buyer paid. The escrow's amount is preferred, since
 * item prices do not show a bundle deal's discount.
 */
function itemsTotalCents(raw: z.output<typeof orderSchema>, income: EscrowIncome | undefined) {
  if (income?.itemsTotalCents !== undefined) {
    return income.itemsTotalCents;
  }
  const total = raw.item_list.reduce(
    (sum, item) => sum + unitPrice(item) * item.model_quantity_purchased,
    0,
  );
  return storedCents(total, "total");
}

function mapOrder(
  raw: z.output<typeof orderSchema>,
  escrow: ReadonlyMap<string, EscrowIncome>,
): MarketplaceOrder {
  const income = escrow.get(raw.order_sn);
  const address = readRecipient(raw.recipient_address);
  const recipient = recipientSchema.safeParse(raw.recipient_address);
  const status = Object.hasOwn(orderStatuses, raw.order_status)
    ? orderStatuses[raw.order_status]
    : undefined;

  if (status === undefined) {
    if (unresolvedOrderStatus.safeParse(raw.order_status).success) {
      throw marketplaceError(
        "A Shopee ainda está analisando o cancelamento ou a devolução deste pedido.",
        { retryable: true },
      );
    }

    throw marketplaceError("A Shopee retornou um status de pedido desconhecido.", {
      retryable: false,
    });
  }

  return {
    externalOrderId: raw.order_sn,
    status,
    totalCents: itemsTotalCents(raw, income),
    // Checked here, not in the escrow read: one order's odd fee must not drop the whole page.
    marketplaceFeeCents:
      income?.feeCents === undefined ? undefined : withinStoredLimit(income.feeCents, "tarifa"),
    buyerName: recipient.success ? buyerNameOf(recipient.data.name) : null,
    shippingAddress: address ?? undefined,
    orderedAt: new Date(raw.create_time * 1_000),
    items: raw.item_list.map((item) => ({
      externalListingId:
        item.model_id === 0 ? String(item.item_id) : `${item.item_id}:${item.model_id}`,
      title: [item.item_name, item.model_name].filter(Boolean).join(" - ").slice(0, 240),
      quantity: item.model_quantity_purchased,
      unitPriceCents: storedCents(unitPrice(item), "preço"),
    })),
  };
}

export async function readDetails(
  context: ShopeeContext,
  store: StoreCredentials,
  serials: readonly string[],
  fields: string,
) {
  return requestShop(context, {
    accessToken: store.accessToken,
    shopId: store.externalShopId,
    method: "GET",
    path: "/api/v2/order/get_order_detail",
    payload: "response",
    schema: orderDetailSchema,
    query: {
      order_sn_list: serials.join(","),
      request_order_status_pending: "true",
      response_optional_fields: fields,
    },
  });
}

async function readEscrow(context: ShopeeContext, store: StoreCredentials, serials: string[]) {
  try {
    return await requestShop(context, {
      accessToken: store.accessToken,
      shopId: store.externalShopId,
      method: "POST",
      path: "/api/v2/payment/get_escrow_detail_batch",
      payload: "response",
      schema: escrowSchema,
      json: { order_sn_list: serials },
    });
  } catch (error) {
    if (!isFinalMarketplaceAnswer(error)) {
      throw error;
    }

    logger.warn("shopee.order_fees_unavailable", { externalShopId: store.externalShopId, error });
    return [];
  }
}

/** One order's fee in cents; a credit larger than the charges leaves no fee. */
function feeCents(
  store: StoreCredentials,
  orderSn: string,
  parts: readonly (number | undefined)[],
) {
  if (parts.every((part) => part === undefined)) {
    return undefined;
  }
  const total = Math.round(parts.reduce<number>((sum, part) => sum + (part ?? 0), 0) * 100);
  if (total >= 0) {
    return total;
  }

  logger.warn("shopee.order_fee_negative", { externalShopId: store.externalShopId, orderSn });
  return 0;
}

/** Each escrow row is read on its own: one odd row must not drop the income of the others. */
async function readIncome(context: ShopeeContext, store: StoreCredentials, serials: string[]) {
  const incomes = new Map<string, EscrowIncome>();
  for (let offset = 0; offset < serials.length; offset += ESCROW_PAGE_SIZE) {
    const requested = serials.slice(offset, offset + ESCROW_PAGE_SIZE);
    for (const raw of await readEscrow(context, store, requested)) {
      const row = escrowRowSchema.safeParse(raw);
      if (!row.success) {
        logger.warn("shopee.order_fee_unreadable", { externalShopId: store.externalShopId });
        continue;
      }

      const escrow = row.data.escrow_detail;
      if (escrow?.order_income === undefined || !requested.includes(escrow.order_sn)) {
        continue;
      }

      const { cost_of_goods_sold: itemsTotal, ...fees } = escrow.order_income;
      incomes.set(escrow.order_sn, {
        feeCents: feeCents(store, escrow.order_sn, Object.values(fees)),
        itemsTotalCents:
          itemsTotal === undefined || itemsTotal <= 0
            ? undefined
            : storedCents(itemsTotal, "total"),
      });
    }
  }

  return incomes;
}

function feeCandidates(rows: readonly unknown[]): string[] {
  return rows.flatMap((row) => {
    const parsed = orderSchema.safeParse(row);

    if (
      !parsed.success ||
      !Object.hasOwn(orderStatuses, parsed.data.order_status) ||
      orderStatuses[parsed.data.order_status] === "pending"
    ) {
      return [];
    }

    return [parsed.data.order_sn];
  });
}

function missingOrder() {
  return marketplaceError("A Shopee não retornou o pedido solicitado.", { retryable: false });
}

export async function fetchOrder(
  context: ShopeeContext,
  store: StoreCredentials,
  resource: string,
) {
  const serial = parseSerial(resource);
  const detail = await readDetails(context, store, [serial], ORDER_FIELDS);
  const order = detail.order_list
    .map((row) => orderSchema.safeParse(row))
    .find((row) => row.success && row.data.order_sn === serial);
  if (order?.success !== true) {
    throw missingOrder();
  }

  const income = await readIncome(context, store, feeCandidates([order.data]));
  return mapOrder(order.data, income);
}

export async function readOrderPackages(
  context: ShopeeContext,
  store: StoreCredentials,
  resource: string,
) {
  const serial = parseSerial(resource);
  const response = await readDetails(context, store, [serial], "package_list,split_up");
  const order = response.order_list
    .map((row) => packageOrderSchema.safeParse(row))
    .find((row) => row.success && row.data.order_sn === serial);
  if (order?.success !== true) {
    throw missingOrder();
  }

  return order.data;
}

export async function readShippingAddress(
  context: ShopeeContext,
  store: StoreCredentials,
  resource: string,
) {
  const serial = parseSerial(resource);
  const response = await readDetails(context, store, [serial], "recipient_address");
  const schema = z.object({ order_sn: orderNumber, recipient_address: z.unknown().optional() });
  const order = response.order_list
    .map((row) => schema.safeParse(row))
    .find((row) => row.success && row.data.order_sn === serial);
  const address = order?.success === true ? readRecipient(order.data.recipient_address) : null;
  return shippingAddressReading(address);
}

async function listWindow(
  context: ShopeeContext,
  store: StoreCredentials,
  window: OrderWindow,
  limit: number,
) {
  const seenCursors = new Set<string>();
  const numbers = new Set<string>();
  let cursor = "";
  for (let page = 0; page < MAX_LIST_PAGES_PER_WINDOW; page += 1) {
    const result = await requestShop(context, {
      accessToken: store.accessToken,
      shopId: store.externalShopId,
      method: "GET",
      path: "/api/v2/order/get_order_list",
      payload: "response",
      schema: orderListSchema,
      query: {
        time_range_field: window.field,
        time_from: String(window.from),
        time_to: String(window.to),
        page_size: String(LIST_PAGE_SIZE),
        cursor,
        request_order_status_pending: "true",
      },
    });
    for (const order of result.order_list) {
      numbers.add(order.order_sn);
    }

    // A Date cursor cannot split orders in the same second. Keep that second together.
    if (numbers.size > limit && window.from < window.to) {
      return null;
    }

    if (!result.more) {
      return [...numbers];
    }

    if (!result.next_cursor || seenCursors.has(result.next_cursor)) {
      break;
    }

    cursor = result.next_cursor;
    seenCursors.add(cursor);
  }

  throw marketplaceError("A Shopee não terminou de listar os pedidos. Tente de novo.", {
    retryable: true,
  });
}

export async function listOrders(
  context: ShopeeContext,
  store: StoreCredentials,
  since: Date,
  field: OrderWindow["field"] = "create_time",
): Promise<MarketplaceOrderBatch> {
  const orders = new Map<string, MarketplaceOrder>();
  const until = Math.floor(context.now().getTime() / 1_000);
  let from = Math.floor(since.getTime() / 1_000);
  while (from <= until && orders.size < MAX_BATCH_ORDERS) {
    const window = { field, from, to: Math.min(until, from + WINDOW_SECONDS - 1) };
    const limit = MAX_BATCH_ORDERS - orders.size;
    let numbers = await listWindow(context, store, window, limit);
    while (numbers === null) {
      window.to = from + Math.floor((window.to - from) / 2);
      numbers = await listWindow(context, store, window, limit);
    }

    for (let offset = 0; offset < numbers.length; offset += DETAIL_PAGE_SIZE) {
      const requested = numbers.slice(offset, offset + DETAIL_PAGE_SIZE);
      const detail = await readDetails(context, store, requested, ORDER_FIELDS);
      // Keep the last confirmed state during a cancellation or a return request.
      const rows = detail.order_list.filter((row) => !unresolvedOrder.safeParse(row).success);
      const income = await readIncome(context, store, feeCandidates(rows));
      const windowOrders = readableOrders(rows, {
        schema: orderSchema,
        map: (raw) => mapOrder(raw, income),
        event: "shopee.order_skipped",
        channelOwner: "da Shopee",
        externalShopId: store.externalShopId,
        orderIdField: "order_sn",
      }).filter(
        (order) =>
          requested.includes(order.externalOrderId) &&
          (field === "update_time" || order.orderedAt >= since),
      );

      for (const order of windowOrders) {
        orders.set(order.externalOrderId, order);
      }
    }

    from = window.to + 1;
  }

  return {
    orders: [...orders.values()].toSorted(
      (first, second) => first.orderedAt.getTime() - second.orderedAt.getTime(),
    ),
    resumeFrom: from <= until ? new Date(from * 1_000) : null,
  };
}
