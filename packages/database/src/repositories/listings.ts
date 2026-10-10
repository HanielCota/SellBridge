import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { hasActiveTargets } from "./active-targets.ts";
import { containsPattern } from "./search-pattern.ts";
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

function listingIdempotencyKey(listingId: string, storeConnectionId: string): string {
  return `${listingId}:${storeConnectionId}`;
}

export async function createListingWithTargets(
  database: Database,
  tenantId: string,
  input: NewListingInput,
  storeConnectionIds: readonly string[],
): Promise<CreatedListing> {
  if (storeConnectionIds.length === 0) {
    throw conflictError("Escolha ao menos uma loja de destino");
  }
  return database.transaction(async (transaction) => {
    const [listing] = await transaction
      .insert(listings)
      .values({ ...input, tenantId })
      .returning({ id: listings.id });
    if (!listing) {
      throw conflictError("Não foi possível criar o anúncio");
    }
    const targets = await transaction
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

function listingTargetConditions(tenantId: string, filters: ListingTargetFilters): SQL | undefined {
  const conditions: SQL[] = [eq(listingTargets.tenantId, tenantId)];
  if (filters.status) {
    conditions.push(eq(listingTargets.status, filters.status));
  }
  if (filters.search) {
    conditions.push(ilike(listings.title, containsPattern(filters.search)));
  }
  return and(...conditions);
}

function selectListingTargetRows(database: Database) {
  return database
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
}

export async function listListingTargets(
  database: Database,
  tenantId: string,
  filters: ListingTargetFilters,
  pagination: Pagination,
): Promise<Paginated<ListingTargetRow> & { hasActive: boolean }> {
  const where = listingTargetConditions(tenantId, filters);
  const [rows, totals, active] = await Promise.all([
    selectListingTargetRows(database)
      .where(where)
      .orderBy(desc(listingTargets.createdAt), desc(listingTargets.id))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database
      .select({ total: count() })
      .from(listingTargets)
      .innerJoin(listings, eq(listings.id, listingTargets.listingId))
      .where(where),
    hasActiveTargets(database, tenantId),
  ]);
  return {
    ...toPaginated(rows, totals.at(0)?.total ?? 0, pagination),
    hasActive: active,
  };
}

export interface TargetForPublishing {
  target: typeof listingTargets.$inferSelect;
  listing: typeof listings.$inferSelect;
  product: typeof supplierProducts.$inferSelect;
  store: typeof storeConnections.$inferSelect;
}

export async function getTargetForPublishing(
  database: Database,
  tenantId: string,
  listingTargetId: string,
): Promise<TargetForPublishing> {
  const [row] = await database
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
    throw notFoundError("Publicação não encontrada");
  }
  return row;
}

export async function markTargetPublishing(
  database: Database,
  listingTargetId: string,
): Promise<void> {
  await database
    .update(listingTargets)
    .set({ status: "publishing", attempts: sql`${listingTargets.attempts} + 1` })
    .where(eq(listingTargets.id, listingTargetId));
}

export async function markTargetPublished(
  database: Database,
  listingTargetId: string,
  result: { externalId: string; externalUrl: string | null },
): Promise<void> {
  await database
    .update(listingTargets)
    .set({ ...result, status: "published", errorReason: null, publishedAt: new Date() })
    .where(eq(listingTargets.id, listingTargetId));
}

/**
 * Records a failed attempt. While retries remain the target goes back to "pending"
 * (with the reason visible); on the final attempt it becomes "error".
 */
export async function markTargetFailed(
  database: Database,
  listingTargetId: string,
  reason: string,
  options: { final: boolean },
): Promise<void> {
  await database
    .update(listingTargets)
    .set({ status: options.final ? "error" : "pending", errorReason: reason })
    .where(eq(listingTargets.id, listingTargetId));
}

export interface TargetNeedingSync {
  targetId: string;
  externalId: string;
  stock: number;
  priceCents: number;
  store: typeof storeConnections.$inferSelect;
}

/** Stock to show on the marketplace: zero while the reseller has the listing paused. */
const liveStock =
  sql<number>`case when ${listingTargets.status} = 'paused' then 0 else ${supplierProducts.stock} end`.mapWith(
    Number,
  );

/**
 * Live listings whose stock or price differs from what was last sent to the marketplace
 * (all tenants; used by the worker sync job).
 */
export async function findTargetsNeedingSync(
  database: Database,
  limit = 200,
): Promise<TargetNeedingSync[]> {
  const rows = await database
    .select({
      targetId: listingTargets.id,
      externalId: listingTargets.externalId,
      stock: liveStock,
      priceCents: listings.priceCents,
      store: storeConnections,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(
      and(
        sql`${listingTargets.status} in ('published', 'paused')`,
        eq(storeConnections.status, "connected"),
        sql`${listingTargets.externalId} is not null`,
        sql`(${listingTargets.syncedStock} is distinct from ${liveStock}
          or ${listingTargets.syncedPriceCents} is distinct from ${listings.priceCents})`,
      ),
    )
    .limit(limit);
  return rows.flatMap((row) => (row.externalId ? [{ ...row, externalId: row.externalId }] : []));
}

export async function markTargetSynced(
  database: Database,
  listingTargetId: string,
  synced: { stock: number; priceCents: number },
): Promise<void> {
  await database
    .update(listingTargets)
    .set({ syncedStock: synced.stock, syncedPriceCents: synced.priceCents, syncedAt: new Date() })
    .where(eq(listingTargets.id, listingTargetId));
}
