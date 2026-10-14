import { conflictError } from "@sellbridge/shared/errors";
import { and, eq, inArray } from "drizzle-orm";
import type { OrderEventData } from "@sellbridge/shared/public-api";
import type { Database } from "../client.ts";
import { listings, listingTargets, orderItems, orders, supplierProducts } from "../schema/index.ts";
import { reconciledOrderStatus } from "./fulfillment-status.ts";
import { recordApiEvent } from "./api-events.ts";
import { syncMarketplaceRefund } from "./marketplace-refunds.ts";
import { recordOrderStatusChange } from "./order-status-changes.ts";
import { applyStockMoves } from "./stock-reservations.ts";

export interface IncomingOrder {
  externalOrderId: string;
  status: (typeof orders.$inferInsert)["status"];
  totalCents: number;
  marketplaceFeeCents: number;
  /** Money given back to the buyer so far; omitted when the source does not report it. */
  refundedCents?: number | undefined;
  buyerName: string | null;
  orderedAt: Date;
  items: { externalListingId: string; title: string; quantity: number; unitPriceCents: number }[];
}

export type UpsertOrderResult = {
  status: "created" | "updated";
  orderId: string;
  /** Order items that moved supplier stock in this write; above zero, sync the marketplaces. */
  stockMoves: number;
};
type OrderWriteResult = Omit<UpsertOrderResult, "stockMoves">;

interface ResolvedListing {
  listingTargetId: string;
  supplierProductId: string;
  costCents: number;
}

/** Maps marketplace listing ids of this store to our listing targets and supplier costs. */
async function resolveListings(
  database: Database,
  tenantId: string,
  storeConnectionId: string,
  externalIds: string[],
): Promise<Map<string, ResolvedListing>> {
  if (externalIds.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      externalId: listingTargets.externalId,
      listingTargetId: listingTargets.id,
      supplierProductId: supplierProducts.id,
      costCents: supplierProducts.costCents,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .where(
      and(
        eq(listingTargets.tenantId, tenantId),
        eq(listingTargets.storeConnectionId, storeConnectionId),
        inArray(listingTargets.externalId, externalIds),
      ),
    );
  return new Map(
    rows.flatMap(({ externalId, ...listing }): [string, ResolvedListing][] =>
      externalId ? [[externalId, listing]] : [],
    ),
  );
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface OrderWrite {
  readonly transaction: Transaction;
  readonly tenantId: string;
  readonly storeConnectionId: string;
  readonly order: IncomingOrder;
  readonly listingsByExternalId: Map<string, ResolvedListing>;
}

/** The first sync that sees the order delivered dates the delivery; later syncs keep that date. */
function deliveredAtOnUpdate(
  existing: typeof orders.$inferSelect,
  status: IncomingOrder["status"],
): Date | null {
  if (existing.deliveredAt !== null || status !== "delivered") {
    return existing.deliveredAt;
  }
  return new Date();
}

/** Public event snapshot of an order write (see packages/shared/src/public-api/events.ts). */
function orderEventData(
  write: OrderWrite,
  order: { orderId: string; orderedAt: Date; previousStatus: string | null },
): OrderEventData {
  return {
    orderId: order.orderId,
    externalOrderId: write.order.externalOrderId,
    storeId: write.storeConnectionId,
    status: write.order.status,
    previousStatus: order.previousStatus,
    totalCents: write.order.totalCents,
    orderedAt: order.orderedAt.toISOString(),
  };
}

async function updateExistingOrder(
  write: OrderWrite,
  existing: typeof orders.$inferSelect,
): Promise<OrderWriteResult> {
  if (existing.tenantId !== write.tenantId) {
    throw conflictError("Pedido pertence a outro tenant");
  }
  await write.transaction
    .update(orders)
    .set({
      status: write.order.status,
      totalCents: write.order.totalCents,
      marketplaceFeeCents: write.order.marketplaceFeeCents,
      deliveredAt: deliveredAtOnUpdate(existing, write.order.status),
    })
    .where(eq(orders.id, existing.id));
  // Re-deliveries of the same status (retries, total changes) are not news to integrators.
  if (existing.status !== write.order.status) {
    await recordOrderStatusChange(write.transaction, {
      tenantId: write.tenantId,
      orderId: existing.id,
      status: write.order.status,
    });
    await recordApiEvent(write.transaction, {
      tenantId: write.tenantId,
      type: "order.status_changed",
      data: orderEventData(write, {
        orderId: existing.id,
        orderedAt: existing.orderedAt,
        previousStatus: existing.status,
      }),
    });
  }
  return { status: "updated", orderId: existing.id };
}

async function insertOrderItems(write: OrderWrite, orderId: string): Promise<void> {
  if (write.order.items.length === 0) {
    return;
  }
  await write.transaction.insert(orderItems).values(
    write.order.items.map((item) => {
      const listing = write.listingsByExternalId.get(item.externalListingId);
      return {
        tenantId: write.tenantId,
        orderId,
        listingTargetId: listing?.listingTargetId ?? null,
        supplierProductId: listing?.supplierProductId ?? null,
        title: item.title,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        unitCostCents: listing?.costCents ?? 0,
      };
    }),
  );
}

async function createOrder(write: OrderWrite): Promise<OrderWriteResult> {
  const { order } = write;
  const [created] = await write.transaction
    .insert(orders)
    .values({
      tenantId: write.tenantId,
      storeConnectionId: write.storeConnectionId,
      externalOrderId: order.externalOrderId,
      status: order.status,
      totalCents: order.totalCents,
      marketplaceFeeCents: order.marketplaceFeeCents,
      buyerName: order.buyerName,
      orderedAt: order.orderedAt,
      deliveredAt: order.status === "delivered" ? order.orderedAt : null,
    })
    .returning({ id: orders.id });
  if (!created) {
    // An insert that returns no row is an unexpected write failure, not a business conflict.
    throw new Error("Não foi possível gravar o pedido");
  }
  await insertOrderItems(write, created.id);
  // The first step is the sale itself, dated when it happened, not when the sync saw it.
  await recordOrderStatusChange(write.transaction, {
    tenantId: write.tenantId,
    orderId: created.id,
    status: order.status,
    at: order.orderedAt,
  });
  await recordApiEvent(write.transaction, {
    tenantId: write.tenantId,
    type: "order.created",
    data: orderEventData(write, {
      orderId: created.id,
      orderedAt: order.orderedAt,
      previousStatus: null,
    }),
  });
  return { status: "created", orderId: created.id };
}

/**
 * A return is known from the shipments, not from the marketplace's order status, which stays
 * "paid" (or partially refunded). A returned order keeps that status until it is cancelled.
 */
function keptReturned(
  current: (typeof orders.$inferSelect)["status"],
  incoming: IncomingOrder["status"],
): IncomingOrder["status"] {
  if (current === "returned" && ["paid", "shipped", "delivered"].includes(incoming)) {
    return "returned";
  }
  return incoming;
}

async function writeOrder(write: OrderWrite): Promise<UpsertOrderResult> {
  // Locked so two syncs of the same order run one after the other: each sees the status the
  // other wrote, and a status change is recorded (and announced) once.
  const [existing] = await write.transaction
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.storeConnectionId, write.storeConnectionId),
        eq(orders.externalOrderId, write.order.externalOrderId),
      ),
    )
    .for("update");
  if (existing) {
    const status = await reconciledOrderStatus(
      write.transaction,
      existing.id,
      keptReturned(existing.status, write.order.status),
    );
    const updated = await updateExistingOrder(
      { ...write, order: { ...write.order, status } },
      existing,
    );
    const stockMoves = await applyStockMoves(write.transaction, existing.id, status);
    await syncMarketplaceRefund(write.transaction, {
      tenantId: write.tenantId,
      orderId: existing.id,
      status,
      refundedCents: write.order.refundedCents,
    });
    return { ...updated, stockMoves };
  }
  const created = await createOrder(write);
  const stockMoves = await applyStockMoves(write.transaction, created.orderId, write.order.status);
  await syncMarketplaceRefund(write.transaction, {
    tenantId: write.tenantId,
    orderId: created.orderId,
    status: write.order.status,
    refundedCents: write.order.refundedCents,
  });
  return { ...created, stockMoves };
}

/**
 * Idempotent upsert of a marketplace order: the first delivery creates it with its items,
 * later deliveries (status changes, retries) only update status, totals and fee.
 * Items whose listing is not ours are kept with zero cost so revenue is never lost.
 * Every write also brings the supplier stock in line with the new status (stock-reservations.ts).
 */
export async function upsertMarketplaceOrder(
  database: Database,
  tenantId: string,
  storeConnectionId: string,
  order: IncomingOrder,
): Promise<UpsertOrderResult> {
  const listingsByExternalId = await resolveListings(
    database,
    tenantId,
    storeConnectionId,
    order.items.map((item) => item.externalListingId),
  );
  return database.transaction(async (transaction) =>
    writeOrder({ transaction, tenantId, storeConnectionId, order, listingsByExternalId }),
  );
}
