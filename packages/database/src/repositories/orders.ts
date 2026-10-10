import { conflictError } from "@sellbridge/shared/errors";
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

async function updateExistingOrder(
  write: OrderWrite,
  existing: typeof orders.$inferSelect,
): Promise<UpsertOrderResult> {
  if (existing.tenantId !== write.tenantId) {
    throw conflictError("Pedido pertence a outro tenant");
  }
  await write.transaction
    .update(orders)
    .set({
      status: write.order.status,
      totalCents: write.order.totalCents,
      marketplaceFeeCents: write.order.marketplaceFeeCents,
    })
    .where(eq(orders.id, existing.id));
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

async function createOrder(write: OrderWrite): Promise<UpsertOrderResult> {
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
    })
    .returning({ id: orders.id });
  if (!created) {
    throw conflictError("Não foi possível gravar o pedido");
  }
  await insertOrderItems(write, created.id);
  return { status: "created", orderId: created.id };
}

async function writeOrder(write: OrderWrite): Promise<UpsertOrderResult> {
  const existing = await write.transaction.query.orders.findFirst({
    where: and(
      eq(orders.storeConnectionId, write.storeConnectionId),
      eq(orders.externalOrderId, write.order.externalOrderId),
    ),
  });
  if (existing) {
    return updateExistingOrder(write, existing);
  }
  return createOrder(write);
}

/**
 * Idempotent upsert of a marketplace order: the first delivery creates it with its items,
 * later deliveries (status changes, retries) only update status, totals and fee.
 * Items whose listing is not ours are kept with zero cost so revenue is never lost.
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
