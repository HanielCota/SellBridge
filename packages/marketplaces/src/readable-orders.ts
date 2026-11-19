import { logger } from "@sellbridge/shared/logger";
import { QUEUE_NAMES } from "@sellbridge/shared/queues";
import type { z } from "zod";
import type { MarketplaceOrder } from "./types.ts";

/** The order's own id for the log, when the row has a readable one. */
function orderIdOf(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !Object.hasOwn(raw, "id")) {
    return null;
  }
  const id: unknown = Reflect.get(raw, "id");
  return typeof id === "string" || typeof id === "number" ? String(id).slice(0, 40) : null;
}

interface ReadableOrdersInput<Raw> {
  schema: z.ZodType<Raw>;
  map: (raw: Raw) => MarketplaceOrder;
  event: string;
  /** The marketplace after "venda": "do Mercado Livre". */
  channelOwner: string;
  externalShopId: string;
}

/**
 * A skipped sale is lost to the reseller unless someone enters it by hand, so it goes to the
 * admin Problemas page (an error), one problem per sale, with what to do about it.
 */
function reportSkipped(
  input: Pick<ReadableOrdersInput<unknown>, "event" | "channelOwner" | "externalShopId">,
  row: unknown,
  cause: { error?: unknown; shape?: string },
): void {
  const externalOrderId = orderIdOf(row);
  logger.error(input.event, {
    reason: `Uma venda ${input.channelOwner} veio num formato que o SellBridge não consegue ler e ficou de fora. Confira a venda no painel do canal e, se for do revendedor, lance como venda manual.`,
    externalOrderId,
    externalShopId: input.externalShopId,
    queue: QUEUE_NAMES.webhookEvents,
    problemKey: `${input.externalShopId}:${externalOrderId ?? "sem-id"}`,
    ...(cause.shape === undefined ? {} : { diagnostic: cause.shape }),
    ...(cause.error === undefined ? {} : { error: cause.error }),
  });
}

/**
 * Reads a page of marketplace orders one at a time: an order that does not match the schema or
 * cannot be mapped (another currency, an amount past what is stored, no date) is reported and
 * skipped, so it never stops the rest of the page, or every later reconnection, from coming in.
 */
export function readableOrders<Raw>(
  rows: readonly unknown[],
  input: ReadableOrdersInput<Raw>,
): MarketplaceOrder[] {
  const orders: MarketplaceOrder[] = [];
  for (const row of rows) {
    const parsed = input.schema.safeParse(row);
    if (!parsed.success) {
      reportSkipped(input, row, { shape: "unexpected_shape" });
      continue;
    }
    try {
      orders.push(input.map(parsed.data));
    } catch (error) {
      reportSkipped(input, row, { error });
    }
  }
  return orders;
}
