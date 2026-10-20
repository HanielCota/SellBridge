import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  storeSupplierRefusal,
  storeSupplierRefusalMessage,
} from "@sellbridge/shared/store-supplier";
import { STORE_SUPPLIER_CHANGED_MESSAGE } from "@sellbridge/shared/store-supplier";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  listings,
  listingTargets,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { publicSupplier } from "./sql/sellable.ts";

type ListingTargetStatus = (typeof listingTargets.$inferSelect)["status"];

export interface AssignStoreSupplierInput {
  tenantId: string;
  storeConnectionId: string;
  supplierId: string;
}

/** Refuses a supplier that does not exist or is inactive. */
export async function assertActiveSupplier(
  executor: DatabaseExecutor,
  supplierId: string,
): Promise<void> {
  const [supplier] = await executor
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.active, true), publicSupplier()))
    .limit(1);
  if (supplier === undefined) {
    throw notFoundError("Fornecedor não encontrado ou inativo");
  }
}

/**
 * Links a shop of the tenant to the one supplier it sells. Moving the shop's existing listings
 * off the previous supplier is the caller's job (it shows the impact first).
 */
export async function assignStoreSupplier(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<void> {
  await assertActiveSupplier(database, input.supplierId);
  await linkStore(database, input);
}

async function linkStore(executor: DatabaseExecutor, input: AssignStoreSupplierInput) {
  const updated = await executor
    .update(storeConnections)
    .set({ supplierId: input.supplierId })
    .where(
      and(
        eq(storeConnections.id, input.storeConnectionId),
        eq(storeConnections.tenantId, input.tenantId),
        ne(storeConnections.status, "disconnected"),
      ),
    )
    .returning({ id: storeConnections.id });
  if (updated.length === 0) {
    throw notFoundError("Loja não encontrada");
  }
}

/** What moving a shop to another supplier does to the publications it has today. */
export interface StoreSupplierChangeImpact {
  /** Live listings of other suppliers: paused at zero stock, never deleted. */
  livePaused: number;
  /** Queued or failed publications of other suppliers: stopped, with the reason. */
  queuedStopped: number;
}

const LIVE_STATUSES: readonly ListingTargetStatus[] = ["published", "paused"];
const QUEUED_STATUSES: readonly ListingTargetStatus[] = ["pending", "error"];

/** Targets of the shop whose product comes from a supplier other than `supplierId`. */
function otherSupplierTargets(executor: DatabaseExecutor, input: AssignStoreSupplierInput) {
  return executor
    .select({ id: listingTargets.id })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .where(
      and(
        eq(listingTargets.tenantId, input.tenantId),
        eq(listingTargets.storeConnectionId, input.storeConnectionId),
        ne(supplierProducts.supplierId, input.supplierId),
      ),
    );
}

async function countTargets(
  executor: DatabaseExecutor,
  input: AssignStoreSupplierInput,
  statuses: readonly ListingTargetStatus[],
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(listingTargets)
    .where(
      and(
        inArray(listingTargets.id, otherSupplierTargets(executor, input)),
        inArray(listingTargets.status, [...statuses]),
      ),
    );
  return row?.total ?? 0;
}

/** The impact of moving the shop to `supplierId`, without changing anything. */
export async function previewStoreSupplierChange(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<StoreSupplierChangeImpact> {
  const [livePaused, queuedStopped] = await Promise.all([
    countTargets(database, input, LIVE_STATUSES),
    countTargets(database, input, QUEUED_STATUSES),
  ]);
  return { livePaused, queuedStopped };
}

/**
 * Moves the shop to another supplier. Its live listings of other suppliers pause (zero stock on
 * the marketplace, still listed in the app) and its queued ones stop with the reason; nothing is
 * deleted, and switching back lets the seller resume them.
 */
export async function changeStoreSupplier(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<StoreSupplierChangeImpact> {
  return database.transaction(async (executor) => {
    await assertActiveSupplier(executor, input.supplierId);
    await linkStore(executor, input);
    await executor
      .update(listingTargets)
      .set({ status: "paused" })
      .where(
        and(
          inArray(listingTargets.id, otherSupplierTargets(executor, input)),
          eq(listingTargets.status, "published"),
        ),
      );
    const livePaused = await countTargets(executor, input, ["paused"]);
    const stopped = await executor
      .update(listingTargets)
      .set({ status: "error", errorReason: STORE_SUPPLIER_CHANGED_MESSAGE })
      .where(
        and(
          inArray(listingTargets.id, otherSupplierTargets(executor, input)),
          inArray(listingTargets.status, [...QUEUED_STATUSES]),
        ),
      )
      .returning({ id: listingTargets.id });
    return { livePaused, queuedStopped: stopped.length };
  });
}

/**
 * Refuses publishing a product of `supplierId` in any of the given shops unless each one sells
 * exactly that supplier. Shops of other tenants are ignored here: the caller already narrowed
 * the list to the tenant's connected shops.
 */
export async function assertStoresSellSupplier(
  executor: DatabaseExecutor,
  tenantId: string,
  storeConnectionIds: readonly string[],
  supplierId: string,
): Promise<void> {
  if (storeConnectionIds.length === 0) {
    return;
  }
  const stores = await executor
    .select({ supplierId: storeConnections.supplierId })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeConnectionIds]),
      ),
    );
  for (const store of stores) {
    const refusal = storeSupplierRefusal(store.supplierId, supplierId);
    if (refusal !== null) {
      throw conflictError(storeSupplierRefusalMessage(refusal));
    }
  }
}

/** Who each shop sells, as the stores page shows it; inactive suppliers included. */
export interface StoreSupplier {
  id: string;
  name: string;
  niche: string;
  state: string;
  city: string;
  logoUrl: string | null;
  active: boolean;
}

export async function findStoreSuppliers(
  database: Database,
  supplierIds: readonly string[],
): Promise<StoreSupplier[]> {
  if (supplierIds.length === 0) {
    return [];
  }
  return database
    .select({
      id: suppliers.id,
      name: suppliers.name,
      niche: suppliers.niche,
      state: suppliers.state,
      city: suppliers.city,
      logoUrl: suppliers.logoUrl,
      active: suppliers.active,
    })
    .from(suppliers)
    .where(inArray(suppliers.id, [...new Set(supplierIds)]));
}
