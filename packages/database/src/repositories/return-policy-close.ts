import { logger } from "@sellbridge/shared/logger";
import {
  supplierObligation,
  type CloseReason,
  type ReturnReason,
} from "@sellbridge/shared/return-policy";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { orderItems, orderShipments, returnClaims, supplierProducts } from "../schema/index.ts";

/** What closing needs to know about a claim, read under its row lock. */
export interface ClosingClaim {
  id: string;
  shipmentId: string;
  orderId: string;
  reason: ReturnReason | null;
  supplierCostCents: number;
  returnShippingCents: number | null;
  supplierResellable: boolean | null;
}

const NOT_FORWARDED_REASON = "O revendedor não reenviou o pacote ao fornecedor em 7 dias";

/**
 * The reseller's version stands: the supplier owes the cost back, plus the return label when
 * the reason is its fault. `credited_cents` must be at least a cent, so a free item records none.
 */
function creditedColumns(claim: ClosingClaim) {
  const obligation = supplierObligation({
    reason: claim.reason,
    supplierCostCents: claim.supplierCostCents,
    returnShippingCents: claim.returnShippingCents,
  });
  return {
    status: "credited" as const,
    creditedCents: obligation.costCents > 0 ? obligation.costCents : null,
    refusalReason: null,
    supplierOwesShippingCents: obligation.shippingCents,
  };
}

function refusedColumns(refusalReason: string) {
  return {
    status: "refused" as const,
    creditedCents: null,
    refusalReason,
    supplierOwesShippingCents: 0,
  };
}

/**
 * Puts the returned units that had left the shelf back on it, once: the claim's
 * `stock_returned_at` is the guard, so a second close (or a retried job) adds nothing. Returns the products whose
 * count went up, so the caller can hand them to waiting orders and resend the listings.
 */
export async function returnStockOnce(
  executor: DatabaseExecutor,
  claim: Pick<ClosingClaim, "id" | "shipmentId" | "orderId">,
  now: Date,
): Promise<string[]> {
  const marked = await executor
    .update(returnClaims)
    .set({ stockReturnedAt: now })
    .where(and(eq(returnClaims.id, claim.id), isNull(returnClaims.stockReturnedAt)))
    .returning({ id: returnClaims.id });
  if (marked.length === 0) {
    return [];
  }
  const [shipment] = await executor
    .select({ items: orderShipments.items, restockItemIds: returnClaims.restockItemIds })
    .from(orderShipments)
    .innerJoin(returnClaims, eq(returnClaims.shipmentId, orderShipments.id))
    .where(eq(orderShipments.id, claim.shipmentId))
    .limit(1);
  // Only units that left the shelf come back: the others were never taken off the count.
  const leftShelf = new Set(shipment?.restockItemIds ?? []);
  const items = (shipment?.items ?? []).filter((item) => leftShelf.has(item.orderItemId));
  if (items.length === 0) {
    return [];
  }
  const products = await executor
    .select({ id: orderItems.id, supplierProductId: orderItems.supplierProductId })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, claim.orderId),
        inArray(
          orderItems.id,
          items.map((item) => item.orderItemId),
        ),
      ),
    );
  const productOf = new Map(products.map((row) => [row.id, row.supplierProductId]));
  const restocked: string[] = [];
  for (const item of items) {
    const productId = productOf.get(item.orderItemId) ?? null;
    if (productId === null || item.quantity <= 0) {
      continue;
    }
    // Sequential on purpose: each write joins the caller's transaction.
    await executor
      .update(supplierProducts)
      .set({
        stock: sql`${supplierProducts.stock} + ${item.quantity}`,
        // A return is not a new count from the supplier: keep the date of its last edit.
        updatedAt: sql`${supplierProducts.updatedAt}`,
      })
      .where(eq(supplierProducts.id, productId));
    restocked.push(productId);
  }
  logger.info("return_policy.stock_returned", { claimId: claim.id, products: restocked.length });
  return restocked;
}

/**
 * Ends a return: records what the supplier owes (money moves later, in stage 2) and, when the
 * supplier said the product can be sold again, puts the units back on its shelf. Runs inside
 * the caller's transaction, with the claim's row locked.
 */
export async function closeReturn(
  executor: DatabaseExecutor,
  claim: ClosingClaim,
  input: { closeReason: CloseReason; now: Date; refusalReason?: string },
): Promise<string[]> {
  const money =
    input.refusalReason === undefined
      ? creditedColumns(claim)
      : refusedColumns(input.refusalReason);
  await executor
    .update(returnClaims)
    .set({
      ...money,
      policyStep: "closed",
      closeReason: input.closeReason,
      closedAt: input.now,
      decidedAt: input.now,
    })
    .where(eq(returnClaims.id, claim.id));
  logger.info("return_policy.closed", {
    claimId: claim.id,
    closeReason: input.closeReason,
    status: money.status,
  });
  if (claim.supplierResellable !== true) {
    return [];
  }
  return returnStockOnce(executor, claim, input.now);
}

/** A parcel that came back to the reseller and never went on to the supplier: nothing is owed. */
export function closeNotForwarded(
  executor: DatabaseExecutor,
  claim: ClosingClaim,
  now: Date,
): Promise<string[]> {
  return closeReturn(executor, claim, {
    closeReason: "not_forwarded",
    now,
    refusalReason: NOT_FORWARDED_REASON,
  });
}
