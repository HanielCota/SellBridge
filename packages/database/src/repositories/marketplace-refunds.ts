import { and, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { orderAdjustments, type orders } from "../schema/index.ts";

type OrderStatus = (typeof orders.$inferSelect)["status"];

/** The one adjustment row the marketplace sync owns per order (see `marketplaceKey`). */
const REFUND_KEY = "refund";

/**
 * How money given back to the buyer counts, by order status (docs/decisions.md, phase 3):
 * on a sale that still counts it is taken off profit; on a returned order (no revenue) it is
 * shown as a return; a cancelled order has no revenue to correct, so nothing is kept.
 */
function refundType(status: OrderStatus): "refund" | "return" | null {
  if (status === "cancelled") return null;
  return status === "returned" ? "return" : "refund";
}

/**
 * Keeps the order's marketplace refund row in line with the latest total and the order's
 * status. `refundedCents` undefined means "not reported this time": the last known total stays.
 * Same input, same row: syncing twice never adds money. The marketplace total also counts the
 * shipping the buyer paid, which is not revenue here, so the row never passes `totalCents`.
 */
export async function syncMarketplaceRefund(
  executor: DatabaseExecutor,
  input: {
    tenantId: string;
    orderId: string;
    status: OrderStatus;
    totalCents: number;
    refundedCents?: number | undefined;
  },
): Promise<void> {
  const owned = and(
    eq(orderAdjustments.orderId, input.orderId),
    eq(orderAdjustments.marketplaceKey, REFUND_KEY),
  );
  const [current] = await executor
    .select({ amountCents: orderAdjustments.amountCents })
    .from(orderAdjustments)
    .where(owned);
  const amountCents = Math.min(
    input.refundedCents ?? current?.amountCents ?? 0,
    Math.max(0, input.totalCents),
  );
  const type = refundType(input.status);
  if (type === null || amountCents <= 0) {
    if (current) await executor.delete(orderAdjustments).where(owned);
    return;
  }
  await executor
    .insert(orderAdjustments)
    .values({
      tenantId: input.tenantId,
      orderId: input.orderId,
      type,
      amountCents,
      reason: "Reembolso ao comprador no marketplace",
      marketplaceKey: REFUND_KEY,
    })
    .onConflictDoUpdate({
      target: [orderAdjustments.orderId, orderAdjustments.marketplaceKey],
      set: { type, amountCents },
    });
}
