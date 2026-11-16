import { logger } from "@sellbridge/shared/logger";
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

/**
 * Reads a page of marketplace orders one at a time: an order that does not match the schema or
 * cannot be mapped (another currency, an amount past what is stored, no date) is logged and
 * skipped, so it never stops the rest of the page, or every later reconnection, from coming in.
 */
export function readableOrders<Raw>(
  rows: readonly unknown[],
  input: { schema: z.ZodType<Raw>; map: (raw: Raw) => MarketplaceOrder; event: string },
): MarketplaceOrder[] {
  const orders: MarketplaceOrder[] = [];
  for (const row of rows) {
    const parsed = input.schema.safeParse(row);
    if (!parsed.success) {
      logger.warn(input.event, { externalOrderId: orderIdOf(row), reason: "unexpected_shape" });
      continue;
    }
    try {
      orders.push(input.map(parsed.data));
    } catch (error) {
      logger.warn(input.event, { externalOrderId: orderIdOf(row), error });
    }
  }
  return orders;
}
