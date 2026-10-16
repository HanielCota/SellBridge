import { assertBillingCapacity } from "./billing.ts";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, asc, count, desc, eq, ilike, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { ListingEventData } from "@sellbridge/shared/public-api";
import type { CatalogAvailability } from "@sellbridge/shared/catalog-availability";
import { safetyMargin } from "@sellbridge/shared/stock-reservation";
import type { Database, DatabaseExecutor, Transaction } from "../client.ts";
import { hasActiveTargets } from "./active-targets.ts";
import { recordApiEvent } from "./api-events.ts";
import { availableStock } from "./sql/available-stock.ts";
import { containsPattern } from "./sql/search-pattern.ts";
import { sellableOnMarketplace } from "./sql/sellable.ts";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";

type ListingTargetStatus = (typeof listingTargets.$inferSelect)["status"];

export interface NewListingInput {
  billingEnabled?: boolean;
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

/** The tenant's stores that already carry a listing of this product, by name. */
export async function storesListingProduct(
  executor: DatabaseExecutor,
  tenantId: string,
  supplierProductId: string,
): Promise<{ storeId: string; storeName: string }[]> {
  return executor
    .selectDistinct({ storeId: storeConnections.id, storeName: storeConnections.shopName })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(
      and(eq(listingTargets.tenantId, tenantId), eq(listings.supplierProductId, supplierProductId)),
    )
    .orderBy(asc(storeConnections.shopName), asc(storeConnections.id));
}

/**
 * One listing per product and store. The stores are locked first, always in the same order, so
 * two publications of the same product wait for each other and the second one sees the first.
 */
async function assertNotListedYet(
  transaction: Transaction,
  tenantId: string,
  supplierProductId: string,
  storeConnectionIds: readonly string[],
): Promise<void> {
  await transaction
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeConnectionIds]),
      ),
    )
    .orderBy(asc(storeConnections.id))
    .for("update");
  const listed = (await storesListingProduct(transaction, tenantId, supplierProductId)).find(
    (store) => storeConnectionIds.includes(store.storeId),
  );
  if (listed) {
    throw conflictError(
      `Este produto já está publicado em ${listed.storeName}. Edite o anúncio existente em Publicações.`,
    );
  }
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
    const { billingEnabled, ...values } = input;
    await assertNotListedYet(transaction, tenantId, values.supplierProductId, storeConnectionIds);
    if (billingEnabled) await assertBillingCapacity(transaction, tenantId, "listings");
    const [listing] = await transaction
      .insert(listings)
      .values({ ...values, tenantId })
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
  const [rows, totals, hasActive] = await Promise.all([
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
  return { ...toPaginated(rows, totals.at(0)?.total ?? 0, pagination), hasActive };
}

export interface TargetForPublishing {
  target: typeof listingTargets.$inferSelect;
  listing: typeof listings.$inferSelect;
  product: typeof supplierProducts.$inferSelect;
  store: typeof storeConnections.$inferSelect;
  availability: CatalogAvailability;
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
      supplierActive: suppliers.active,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(and(eq(listingTargets.tenantId, tenantId), eq(listingTargets.id, listingTargetId)))
    .limit(1);
  if (!row) {
    throw notFoundError("Publicação não encontrada");
  }
  const { supplierActive, ...target } = row;
  return {
    ...target,
    availability: { productActive: row.product.active, supplierActive },
  };
}

/**
 * Moves a pending target to "publishing" and reports whether this caller won it. Only one job
 * can call the marketplace for a target: a duplicate job, a re-enqueue or a stalled re-run
 * finds it no longer pending and backs off instead of creating a second listing.
 */
export async function claimTargetForPublishing(
  database: Database,
  listingTargetId: string,
): Promise<boolean> {
  const claimed = await database
    .update(listingTargets)
    .set({ status: "publishing", attempts: sql`${listingTargets.attempts} + 1` })
    .where(and(eq(listingTargets.id, listingTargetId), eq(listingTargets.status, "pending")))
    .returning({ id: listingTargets.id });
  return claimed.length > 0;
}

export interface StalePendingTarget {
  tenantId: string;
  listingTargetId: string;
  updatedAt: Date;
}

/**
 * Pending targets untouched since `olderThan`: their job never reached the queue (Redis was
 * down when the listing was created) or was lost. All tenants; used by the worker relay.
 */
export async function findStalePendingTargets(
  database: Database,
  olderThan: Date,
  limit = 100,
): Promise<StalePendingTarget[]> {
  return database
    .select({
      tenantId: listingTargets.tenantId,
      listingTargetId: listingTargets.id,
      updatedAt: listingTargets.updatedAt,
    })
    .from(listingTargets)
    .where(and(eq(listingTargets.status, "pending"), lt(listingTargets.updatedAt, olderThan)))
    .orderBy(asc(listingTargets.updatedAt))
    .limit(limit);
}

/**
 * Ends publications stuck in "publishing" since `olderThan`: the worker died mid-call or the
 * result could not be saved. They become "error" (with `listing.failed`) instead of being
 * retried, because the marketplace may already have the listing.
 */
export async function failStalledPublications(
  database: Database,
  olderThan: Date,
  reason: string,
): Promise<number> {
  return database.transaction(async (transaction) => {
    const stalled = await transaction
      .update(listingTargets)
      .set({ status: "error", errorReason: reason })
      .where(and(eq(listingTargets.status, "publishing"), lt(listingTargets.updatedAt, olderThan)))
      .returning(listingEventColumns);
    for (const row of stalled) {
      await recordListingEvent(transaction, "listing.failed", row);
    }
    return stalled.length;
  });
}

/** Columns a listing event needs, read back from the same UPDATE that changed the target. */
const listingEventColumns = {
  tenantId: listingTargets.tenantId,
  listingId: listingTargets.listingId,
  listingTargetId: listingTargets.id,
  storeId: listingTargets.storeConnectionId,
  status: listingTargets.status,
  externalUrl: listingTargets.externalUrl,
  errorReason: listingTargets.errorReason,
};

type ListingEventRow = { tenantId: string } & ListingEventData;

async function recordListingEvent(
  transaction: DatabaseExecutor,
  type: "listing.published" | "listing.failed",
  row: ListingEventRow | undefined,
): Promise<void> {
  if (!row) {
    return;
  }
  const { tenantId, ...data } = row;
  await recordApiEvent(transaction, { tenantId, type, data });
}

/**
 * States a late publish result may still land on. "error" is included: the stalled sweeper may
 * have given up on a call that then succeeded, and the listing is live. A target already
 * "published" or "paused" belongs to another attempt and is never overwritten.
 */
const PUBLISH_RESULT_STATUSES = ["pending", "publishing", "error"] as const;

/** A failure only applies while a publication is in flight, never over a finished one. */
const FAILURE_STATUSES = ["pending", "publishing"] as const;

export async function markTargetPublished(
  database: Database,
  listingTargetId: string,
  result: { externalId: string; externalUrl: string | null },
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(listingTargets)
      .set({ ...result, status: "published", errorReason: null, publishedAt: new Date() })
      .where(
        and(
          eq(listingTargets.id, listingTargetId),
          inArray(listingTargets.status, PUBLISH_RESULT_STATUSES),
        ),
      )
      .returning(listingEventColumns);
    if (!updated) {
      throw notFoundError("Publicação não encontrada ou já publicada por outra tentativa");
    }
    await recordListingEvent(transaction, "listing.published", updated);
  });
}

/**
 * Records a failed attempt. While retries remain the target goes back to "pending" (with the
 * reason visible); on the final attempt it becomes "error" and integrators hear about it
 * (`listing.failed`). Intermediate failures are not events: they may still succeed. A late
 * failure, after the target was published, paused or ended by the stalled sweeper, changes
 * nothing.
 */
export async function markTargetFailed(
  database: Database,
  listingTargetId: string,
  reason: string,
  options: { final: boolean },
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(listingTargets)
      .set({ status: options.final ? "error" : "pending", errorReason: reason })
      .where(
        and(
          eq(listingTargets.id, listingTargetId),
          inArray(listingTargets.status, FAILURE_STATUSES),
        ),
      )
      .returning(listingEventColumns);
    if (!options.final) {
      return;
    }
    await recordListingEvent(transaction, "listing.failed", updated);
  });
}

export interface TargetNeedingSync {
  targetId: string;
  externalId: string;
  stock: number;
  priceCents: number;
  store: typeof storeConnections.$inferSelect;
}

/**
 * Stock to show on the marketplace: zero while the reseller has the listing paused or the
 * product can no longer be sold (inactive product or supplier), and never
 * the last `safetyUnits` sellable units (a buffer against counts that lag behind the shelf).
 * The margin is a validated integer from the environment, inlined because a parameter inside
 * CASE would reach Postgres as text.
 */
function liveStock(safetyUnits: number) {
  const margin = sql.raw(String(safetyMargin(safetyUnits)));
  return sql<number>`case when ${listingTargets.status} = 'paused' or not ${sellableOnMarketplace()} then 0 else greatest(${availableStock} - ${margin}, 0) end`.mapWith(
    Number,
  );
}

/**
 * Live listings whose stock or price differs from what was last sent to the marketplace
 * (all tenants; used by the worker sync job). Never-attempted targets come first and the
 * rest follow the oldest attempt, so targets that keep failing cannot starve the others.
 */
export async function findTargetsNeedingSync(
  database: Database,
  limit = 200,
  safetyUnits = 0,
): Promise<TargetNeedingSync[]> {
  const live = liveStock(safetyUnits);
  const rows = await database
    .select({
      targetId: listingTargets.id,
      externalId: listingTargets.externalId,
      stock: live,
      priceCents: listings.priceCents,
      store: storeConnections,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .innerJoin(storeConnections, eq(storeConnections.id, listingTargets.storeConnectionId))
    .where(
      and(
        sql`${listingTargets.status} in ('published', 'paused')`,
        eq(storeConnections.status, "connected"),
        sql`${listingTargets.externalId} is not null`,
        sql`(${listingTargets.syncedStock} is distinct from ${live}
          or ${listingTargets.syncedPriceCents} is distinct from ${listings.priceCents})`,
      ),
    )
    .orderBy(sql`${listingTargets.syncAttemptedAt} asc nulls first`, asc(listingTargets.id))
    .limit(limit);
  return rows.flatMap((row) => (row.externalId ? [{ ...row, externalId: row.externalId }] : []));
}

export async function markTargetSynced(
  database: Database,
  listingTargetId: string,
  synced: { stock: number; priceCents: number },
): Promise<void> {
  const now = new Date();
  await database
    .update(listingTargets)
    .set({
      syncedStock: synced.stock,
      syncedPriceCents: synced.priceCents,
      syncedAt: now,
      syncAttemptedAt: now,
      syncError: null,
    })
    .where(eq(listingTargets.id, listingTargetId));
}

/** Records a failed sync attempt so the target moves to the back of the sync queue. */
export async function markTargetSyncFailed(
  database: Database,
  listingTargetId: string,
  reason: string,
): Promise<void> {
  await database
    .update(listingTargets)
    .set({ syncAttemptedAt: new Date(), syncError: reason })
    .where(eq(listingTargets.id, listingTargetId));
}

/** Persisted before the remote POST; survives a worker crash or a lost response. */
export async function setTargetCreationStarted(
  database: Database,
  listingTargetId: string,
  started: boolean,
): Promise<void> {
  const rows = await database
    .update(listingTargets)
    .set({ creationStartedAt: started ? new Date() : null })
    .where(and(eq(listingTargets.id, listingTargetId), eq(listingTargets.status, "publishing")))
    .returning({ id: listingTargets.id });
  if (rows.length !== 1) throw conflictError("A publicação não está mais em processamento");
}
