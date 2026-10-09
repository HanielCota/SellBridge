import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listings, listingTargets, orderItems, orders, supplierProducts } from "../schema/index.ts";

export interface IncomingOrder {
  externalOrderId: string;
  status: (typeof orders.$inferInsert)["status"];
  totalCents: number;
  marketplaceFeeCents: number;
  buyerName: string | null;
  orderedAt: Date;
  items: { externalListingId: string; title: string; quantity: number; unitPriceCents: number }[];
}

export type UpsertOrderResult = { status: "created" | "updated"; orderId: string };

/** Maps marketplace listing ids of this store to our listing targets and supplier costs. */
async function resolveListings(
  db: Database,
  tenantId: string,
  storeConnectionId: string,
  externalIds: string[],
) {
  if (externalIds.length === 0) {
    return new Map<
      string,
      { listingTargetId: string; supplierProductId: string; costCents: number }
    >();
  }
  const rows = await db
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
  const map = new Map<
    string,
    { listingTargetId: string; supplierProductId: string; costCents: number }
  >();
  for (const row of rows) {
    if (row.externalId) {
      map.set(row.externalId, row);
    }
  }
  return map;
}

/**
 * Idempotent upsert of a marketplace order: the first delivery creates it with its items,
 * later deliveries (status changes, retries) only update status, totals and fee.
 * Items whose listing is not ours are kept with zero cost so revenue is never lost.
 */
export async function upsertMarketplaceOrder(
  db: Database,
  tenantId: string,
  storeConnectionId: string,
  order: IncomingOrder,
): Promise<UpsertOrderResult> {
  const listingsByExternalId = await resolveListings(
    db,
    tenantId,
    storeConnectionId,
    order.items.map((item) => item.externalListingId),
  );
  return db.transaction(async (tx) => {
    const existing = await tx.query.orders.findFirst({
      where: and(
        eq(orders.storeConnectionId, storeConnectionId),
        eq(orders.externalOrderId, order.externalOrderId),
      ),
    });
    if (existing) {
      if (existing.tenantId !== tenantId) {
        throw new Error("Pedido pertence a outro tenant");
      }
      await tx
        .update(orders)
        .set({
          status: order.status,
          totalCents: order.totalCents,
          marketplaceFeeCents: order.marketplaceFeeCents,
        })
        .where(eq(orders.id, existing.id));
      return { status: "updated", orderId: existing.id };
    }
    const [created] = await tx
      .insert(orders)
      .values({
        tenantId,
        storeConnectionId,
        externalOrderId: order.externalOrderId,
        status: order.status,
        totalCents: order.totalCents,
        marketplaceFeeCents: order.marketplaceFeeCents,
        buyerName: order.buyerName,
        orderedAt: order.orderedAt,
      })
      .returning({ id: orders.id });
    if (!created) {
      throw new Error("Não foi possível gravar o pedido");
    }
    if (order.items.length > 0) {
      await tx.insert(orderItems).values(
        order.items.map((item) => {
          const listing = listingsByExternalId.get(item.externalListingId);
          return {
            tenantId,
            orderId: created.id,
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
    return { status: "created", orderId: created.id };
  });
}
