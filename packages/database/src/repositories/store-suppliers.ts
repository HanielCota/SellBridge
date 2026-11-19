import type { ListingPauseReason } from "@sellbridge/shared/listing-pause-reasons";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  storeSupplierRefusal,
  storeSupplierRefusalMessage,
} from "@sellbridge/shared/store-supplier";
import {
  catalogSourceRefusal,
  STORE_SUPPLIER_CHANGED_MESSAGE,
} from "@sellbridge/shared/store-supplier";
import { SUPPLIER_WITHOUT_RECEIVING_MESSAGE } from "@sellbridge/shared/receiving-rules";
import { and, count, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  listings,
  listingTargets,
  storeConnections,
  storeSuppliers,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import {
  catalogVisibleTo,
  publicSupplier,
  supplierOpenToResellers,
  supplierReceivingRuleMet,
} from "./sql/sellable.ts";
import { storeSupplierIds } from "./sql/store-supplier-match.ts";

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
    .where(and(eq(suppliers.id, supplierId), supplierOpenToResellers(), publicSupplier()))
    .limit(1);
  if (supplier === undefined) {
    throw notFoundError("Fornecedor não encontrado ou inativo");
  }
}

/**
 * Makes `supplierId` the one supplier the shop sells, in place of the ones it had. Moving the
 * shop's existing listings off the previous supplier is the caller's job (it shows the impact
 * first).
 */
export async function assignStoreSupplier(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<void> {
  await database.transaction(async (executor) => {
    await assertActiveSupplier(executor, input.supplierId);
    await linkStore(executor, input);
  });
}

/** Locks the tenant's live shop so concurrent supplier changes run one after the other. */
async function lockStore(executor: DatabaseExecutor, input: AssignStoreSupplierInput) {
  const [store] = await executor
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.id, input.storeConnectionId),
        eq(storeConnections.tenantId, input.tenantId),
        ne(storeConnections.status, "disconnected"),
      ),
    )
    .for("update")
    .limit(1);
  if (store === undefined) {
    throw notFoundError("Loja não encontrada");
  }
  return store;
}

async function linkStore(executor: DatabaseExecutor, input: AssignStoreSupplierInput) {
  const store = await lockStore(executor, input);
  await executor
    .delete(storeSuppliers)
    .where(
      and(
        eq(storeSuppliers.storeConnectionId, store.id),
        ne(storeSuppliers.supplierId, input.supplierId),
      ),
    );
  await executor
    .insert(storeSuppliers)
    .values({ storeConnectionId: store.id, supplierId: input.supplierId })
    .onConflictDoNothing();
}

/**
 * Adds `supplierId` to the suppliers the shop sells, keeping the others. Adding one it already
 * sells changes nothing.
 *
 * @throws NOT_FOUND when the supplier is inactive or gone, or the shop is not the tenant's.
 */
export async function addStoreSupplier(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<void> {
  await database.transaction(async (executor) => {
    await assertActiveSupplier(executor, input.supplierId);
    const store = await lockStore(executor, input);
    await executor
      .insert(storeSuppliers)
      .values({ storeConnectionId: store.id, supplierId: input.supplierId })
      .onConflictDoNothing();
  });
}

/** Refuses removing a supplier the shop does not sell, or the only one it sells. */
async function assertRemovable(executor: DatabaseExecutor, input: AssignStoreSupplierInput) {
  const linked = await executor
    .select({ supplierId: storeSuppliers.supplierId })
    .from(storeSuppliers)
    .where(eq(storeSuppliers.storeConnectionId, input.storeConnectionId));
  if (!linked.some((link) => link.supplierId === input.supplierId)) {
    throw notFoundError("Esta loja não vende este fornecedor");
  }
  // A shop left with no supplier is pending, and pending shops accept every supplier's listings.
  if (linked.length === 1) {
    throw conflictError(
      "A loja precisa vender pelo menos um fornecedor. Adicione outro antes de tirar este.",
    );
  }
}

/** What changing a shop's suppliers does to the publications it has today. */
export interface StoreSupplierChangeImpact {
  /** Live listings of the suppliers left out: paused at zero stock, never deleted. */
  livePaused: number;
  /** Queued or failed publications of the suppliers left out: stopped, with the reason. */
  queuedStopped: number;
}

const LIVE_STATUSES: readonly ListingTargetStatus[] = ["published", "paused"];
const QUEUED_STATUSES: readonly ListingTargetStatus[] = ["pending", "error"];

/** Which of the shop's targets a change reaches: `supplierId`'s own, or every other supplier's. */
type SupplierMatch = "same" | "other";

function supplierTargets(
  executor: DatabaseExecutor,
  input: AssignStoreSupplierInput,
  match: SupplierMatch,
) {
  const supplierCondition =
    match === "same"
      ? eq(supplierProducts.supplierId, input.supplierId)
      : ne(supplierProducts.supplierId, input.supplierId);
  return executor
    .select({ id: listingTargets.id })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        publicSupplier(),
        eq(listingTargets.tenantId, input.tenantId),
        eq(listingTargets.storeConnectionId, input.storeConnectionId),
        supplierCondition,
      ),
    );
}

async function countTargets(
  executor: DatabaseExecutor,
  input: AssignStoreSupplierInput,
  match: SupplierMatch,
  statuses: readonly ListingTargetStatus[],
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(listingTargets)
    .where(
      and(
        inArray(listingTargets.id, supplierTargets(executor, input, match)),
        inArray(listingTargets.status, [...statuses]),
      ),
    );
  return row?.total ?? 0;
}

async function previewImpact(
  database: Database,
  input: AssignStoreSupplierInput,
  match: SupplierMatch,
): Promise<StoreSupplierChangeImpact> {
  const [livePaused, queuedStopped] = await Promise.all([
    countTargets(database, input, match, LIVE_STATUSES),
    countTargets(database, input, match, QUEUED_STATUSES),
  ]);
  return { livePaused, queuedStopped };
}

/**
 * Pauses the reached live listings (zero stock on the marketplace, still listed in the app) and
 * stops the queued ones with the reason. Nothing is deleted.
 */
async function stopTargets(
  executor: DatabaseExecutor,
  input: AssignStoreSupplierInput,
  match: SupplierMatch,
): Promise<StoreSupplierChangeImpact> {
  await executor
    .update(listingTargets)
    .set({ status: "paused", pauseReason: "store_supplier_changed" satisfies ListingPauseReason })
    .where(
      and(
        inArray(listingTargets.id, supplierTargets(executor, input, match)),
        eq(listingTargets.status, "published"),
      ),
    );
  const livePaused = await countTargets(executor, input, match, ["paused"]);
  const stopped = await executor
    .update(listingTargets)
    .set({ status: "error", errorReason: STORE_SUPPLIER_CHANGED_MESSAGE })
    .where(
      and(
        inArray(listingTargets.id, supplierTargets(executor, input, match)),
        inArray(listingTargets.status, [...QUEUED_STATUSES]),
      ),
    )
    .returning({ id: listingTargets.id });
  return { livePaused, queuedStopped: stopped.length };
}

/** The impact of moving the shop to `supplierId`, without changing anything. */
export async function previewStoreSupplierChange(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<StoreSupplierChangeImpact> {
  return previewImpact(database, input, "other");
}

/**
 * Moves the shop to another supplier. Its live listings of other suppliers pause and its queued
 * ones stop with the reason; nothing is deleted, and switching back lets the seller resume them.
 */
export async function changeStoreSupplier(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<StoreSupplierChangeImpact> {
  return database.transaction(async (executor) => {
    await assertActiveSupplier(executor, input.supplierId);
    await linkStore(executor, input);
    return stopTargets(executor, input, "other");
  });
}

/** What removing `supplierId` from the shop would pause or stop, without changing anything. */
export async function previewStoreSupplierRemoval(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<StoreSupplierChangeImpact> {
  return previewImpact(database, input, "same");
}

/**
 * Removes `supplierId` from the suppliers the shop sells. Its live listings of that supplier pause
 * and its queued ones stop with the reason; nothing is deleted, and adding the supplier back lets
 * the seller resume them.
 *
 * @throws NOT_FOUND when the shop is not the tenant's or does not sell the supplier.
 * @throws CONFLICT when it is the only supplier the shop sells.
 */
export async function removeStoreSupplier(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<StoreSupplierChangeImpact> {
  return database.transaction(async (executor) => {
    const store = await lockStore(executor, input);
    await assertRemovable(executor, input);
    await executor
      .delete(storeSuppliers)
      .where(
        and(
          eq(storeSuppliers.storeConnectionId, store.id),
          eq(storeSuppliers.supplierId, input.supplierId),
        ),
      );
    return stopTargets(executor, input, "same");
  });
}

/** The supplier may sell under the admin's receiving-account rule (`supplierReceivingRuleMet`). */
async function receivingRuleMet(executor: DatabaseExecutor, supplierId: string): Promise<boolean> {
  const [row] = await executor
    .select({ met: sql<boolean>`${supplierReceivingRuleMet()}`.mapWith(Boolean) })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  return row?.met === true;
}

/**
 * Refuses publishing a product of `supplierId` in any of the given shops unless each one sells
 * that supplier. Shops of other tenants are ignored here: the caller already narrowed
 * the list to the tenant's connected shops.
 */
export async function assertStoresSellSupplier(
  executor: DatabaseExecutor,
  tenantId: string,
  storeConnectionIds: readonly string[],
  supplierId: string,
): Promise<void> {
  const source = await executor.query.suppliers.findFirst({ where: eq(suppliers.id, supplierId) });
  if (source?.catalogKind === "seller" && source.ownerTenantId !== tenantId) {
    throw notFoundError("Origem do produto não encontrada.");
  }
  // MVP (coordinator decision, 2026-10-22): own products take no new publication, checked
  // before the store list so an empty list cannot skip it.
  const sourceRefusal = source === undefined ? null : catalogSourceRefusal(source.catalogKind);
  if (sourceRefusal !== null) {
    throw conflictError(sourceRefusal);
  }
  if (source !== undefined && !(await receivingRuleMet(executor, supplierId))) {
    throw conflictError(SUPPLIER_WITHOUT_RECEIVING_MESSAGE);
  }
  if (storeConnectionIds.length === 0) {
    return;
  }
  const stores = await executor
    .select({ supplierIds: storeSupplierIds(storeConnections.id) })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeConnectionIds]),
      ),
    );
  for (const store of stores) {
    const refusal = storeSupplierRefusal(store.supplierIds, supplierId);
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

/** Any supplier by id, private seller catalogs included: the team's screens only. */
export async function findStoreSuppliers(
  database: Database,
  supplierIds: readonly string[],
): Promise<StoreSupplier[]> {
  return selectStoreSuppliers(database, supplierIds);
}

/**
 * The suppliers a seller may see by id: public ones and its own private catalog. The stores page
 * takes one id from the URL, and another seller's private catalog would show that seller's name.
 */
export async function findStoreSuppliersVisibleTo(
  database: Database,
  tenantId: string,
  supplierIds: readonly string[],
): Promise<StoreSupplier[]> {
  return selectStoreSuppliers(database, supplierIds, catalogVisibleTo(tenantId));
}

async function selectStoreSuppliers(
  database: Database,
  supplierIds: readonly string[],
  visible?: SQL,
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
    .where(and(inArray(suppliers.id, [...new Set(supplierIds)]), visible));
}
