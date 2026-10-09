import { ConflictError, NotFoundError } from "@sellbridge/shared/errors";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listings, listingTargets, storeConnections, supplierProducts } from "../schema/index.ts";

type ListingTargetStatus = (typeof listingTargets.$inferSelect)["status"];

export interface NewListingInput {
  supplierProductId: string;
  title: string;
  description: string;
  priceCents: number;
}

export interface CreatedListing {
  listingId: string;
  targetIds: string[];
}

export function listingIdempotencyKey(listingId: string, storeConnectionId: string): string {
  return `${listingId}:${storeConnectionId}`;
}

export async function createListingWithTargets(
  db: Database,
  tenantId: string,
  input: NewListingInput,
  storeConnectionIds: readonly string[],
): Promise<CreatedListing> {
  if (storeConnectionIds.length === 0) {
    throw new ConflictError("Escolha ao menos uma loja de destino");
  }
  return db.transaction(async (tx) => {
    const [listing] = await tx
      .insert(listings)
      .values({ ...input, tenantId })
      .returning({ id: listings.id });
    if (!listing) {
      throw new ConflictError("Não foi possível criar o anúncio");
    }
    const targets = await tx
      .insert(listingTargets)
      .values(
        storeConnectionIds.map((storeConnectionId) => ({
          tenantId,
          listingId: listing.id,
          storeConnectionId,
          idempotencyKey: listingIdempotencyKey(listing.id, storeConnectionId),
        })),
      )
      .returning({ id: listingTargets.id });
    return { listingId: listing.id, targetIds: targets.map((target) => target.id) };
  });
}

export interface ListingTargetRow {
  id: string;
  status: ListingTargetStatus;
  errorReason: string | null;
  attempts: number;
  externalId: string | null;
  externalUrl: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  listingId: string;
  title: string;
  priceCents: number;
  costCents: number;
  sku: string;
  storeName: string;
  marketplace: (typeof storeConnections.$inferSelect)["marketplace"];
}

export interface ListingTargetFilters {
  status?: ListingTargetStatus | undefined;
  search?: string | undefined;
}

export async function listListingTargets(
  db: Database,
  tenantId: string,
  filters: ListingTargetFilters,
  pagination: Pagination,
): Promise<Paginated<ListingTargetRow> & { hasActive: boolean }> {
  const conditions: SQL[] = [eq(listingTargets.tenantId, tenantId)];
  if (filters.status) {
    conditions.push(eq(listingTargets.status, filters.status));
  }
  if (filters.search) {
    conditions.push(
      ilike(listings.title, `%${filters.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
    );
  }
  const where = and(...conditions);

  const base = db
    .select({
      id: listingTargets.id,
      status: listingTargets.status,
      errorReason: listingTargets.errorReason,
      attempts: listingTargets.attempts,
      externalId: listingTargets.externalId,
      externalUrl: listingTargets.externalUrl,
      publishedAt: listingTargets.publishedAt,
      updatedAt: listingTargets.updatedAt,
      listingId: listings.id,
      title: listings.title,
      priceCents: listings.priceCents,
      costCents: supplierProducts.costCents,
      sku: supplierProducts.sku,
      storeName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId));

  const [rows, totals, active] = await Promise.all([
    base
      .where(where)
      .orderBy(desc(listingTargets.createdAt), desc(listingTargets.id))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    db
      .select({ total: count() })
      .from(listingTargets)
      .innerJoin(listings, eq(listings.id, listingTargets.listingId))
      .where(where),
    db
      .select({ total: count() })
      .from(listingTargets)
      .where(
        and(
          eq(listingTargets.tenantId, tenantId),
          sql`${listingTargets.status} in ('pending', 'publishing')`,
        ),
      ),
  ]);
  return {
    ...toPaginated(rows, totals.at(0)?.total ?? 0, pagination),
    hasActive: (active.at(0)?.total ?? 0) > 0,
  };
}

export interface TargetForPublishing {
  target: typeof listingTargets.$inferSelect;
  listing: typeof listings.$inferSelect;
  product: typeof supplierProducts.$inferSelect;
  store: typeof storeConnections.$inferSelect;
}

export async function getTargetForPublishing(
  db: Database,
  tenantId: string,
  listingTargetId: string,
): Promise<TargetForPublishing> {
  const [row] = await db
    .select({
      target: listingTargets,
      listing: listings,
      product: supplierProducts,
      store: storeConnections,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(and(eq(listingTargets.tenantId, tenantId), eq(listingTargets.id, listingTargetId)))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Publicação não encontrada");
  }
  return row;
}

export async function markTargetPublishing(db: Database, listingTargetId: string): Promise<void> {
  await db
    .update(listingTargets)
    .set({ status: "publishing", attempts: sql`${listingTargets.attempts} + 1` })
    .where(eq(listingTargets.id, listingTargetId));
}

export async function markTargetPublished(
  db: Database,
  listingTargetId: string,
  result: { externalId: string; externalUrl: string | null },
): Promise<void> {
  await db
    .update(listingTargets)
    .set({ ...result, status: "published", errorReason: null, publishedAt: new Date() })
    .where(eq(listingTargets.id, listingTargetId));
}

/**
 * Records a failed attempt. While retries remain the target goes back to "pending"
 * (with the reason visible); on the final attempt it becomes "error".
 */
export async function markTargetFailed(
  db: Database,
  listingTargetId: string,
  reason: string,
  options: { final: boolean },
): Promise<void> {
  await db
    .update(listingTargets)
    .set({ status: options.final ? "error" : "pending", errorReason: reason })
    .where(eq(listingTargets.id, listingTargetId));
}

/** Puts a failed publication back in the queue. Only targets in "error" can be retried. */
export async function resetTargetForRetry(
  db: Database,
  tenantId: string,
  listingTargetId: string,
): Promise<void> {
  const target = await db.query.listingTargets.findFirst({
    where: and(eq(listingTargets.tenantId, tenantId), eq(listingTargets.id, listingTargetId)),
  });
  if (!target) {
    throw new NotFoundError("Publicação não encontrada");
  }
  if (target.status !== "error") {
    throw new ConflictError("Só é possível reprocessar publicações com erro");
  }
  await db
    .update(listingTargets)
    .set({ status: "pending", errorReason: null })
    .where(eq(listingTargets.id, listingTargetId));
}

export interface TargetNeedingSync {
  targetId: string;
  externalId: string;
  stock: number;
  priceCents: number;
  store: typeof storeConnections.$inferSelect;
}

/**
 * Published listings whose supplier stock or listing price differs from what was last
 * sent to the marketplace (all tenants; used by the worker sync job).
 */
export async function findTargetsNeedingSync(
  db: Database,
  limit = 200,
): Promise<TargetNeedingSync[]> {
  const rows = await db
    .select({
      targetId: listingTargets.id,
      externalId: listingTargets.externalId,
      stock: supplierProducts.stock,
      priceCents: listings.priceCents,
      store: storeConnections,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(
      and(
        eq(listingTargets.status, "published"),
        eq(storeConnections.status, "connected"),
        sql`${listingTargets.externalId} is not null`,
        sql`(${listingTargets.syncedStock} is distinct from ${supplierProducts.stock}
          or ${listingTargets.syncedPriceCents} is distinct from ${listings.priceCents})`,
      ),
    )
    .limit(limit);
  return rows.flatMap((row) => (row.externalId ? [{ ...row, externalId: row.externalId }] : []));
}

export async function markTargetSynced(
  db: Database,
  listingTargetId: string,
  synced: { stock: number; priceCents: number },
): Promise<void> {
  await db
    .update(listingTargets)
    .set({ syncedStock: synced.stock, syncedPriceCents: synced.priceCents, syncedAt: new Date() })
    .where(eq(listingTargets.id, listingTargetId));
}
