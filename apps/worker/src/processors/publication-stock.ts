import {
  getTargetForPublishing,
  markTargetSynced,
  markTargetSyncFailed,
  type TargetForPublishing,
} from "@sellbridge/database/repositories";
import { unavailableReason } from "@sellbridge/shared/catalog-availability";
import { userMessageOr } from "@sellbridge/shared/errors";
import { marketplaceUnits } from "@sellbridge/shared/marketplace-units";
import { offeredUnits } from "@sellbridge/shared/stock-reservation";
import { storeSupplierRefusal } from "@sellbridge/shared/store-supplier";
import { resolveStoreCredentials, storeRateKey } from "../lib/store-access.ts";
import type { StockPriceSyncDependencies } from "./stock-price-sync.ts";

type Dependencies = Pick<
  StockPriceSyncDependencies,
  "database" | "connectors" | "cipher" | "acquireRateLimit" | "safetyUnits" | "showcaseUnits"
>;
type SentUnitsSettings = Pick<Dependencies, "safetyUnits" | "showcaseUnits">;
interface StockValues {
  stock: number;
  priceCents: number;
}
interface PublicationScope {
  tenantId: string;
  targetId: string;
  sent?: StockValues;
}

/**
 * The stock a marketplace receives for the product: what can really be sold, plus the Shopee
 * showcase while that is above 0. Mirrors `liveStock` in the database package; SellBridge
 * screens keep showing the real units.
 */
export function unitsToSend(row: TargetForPublishing, settings: SentUnitsSettings): number {
  return marketplaceUnits({
    marketplace: row.store.marketplace,
    realUnits: offeredUnits(row.product.stock, row.product.reservedStock, settings.safetyUnits),
    showcaseUnits: settings.showcaseUnits,
  });
}

function liveUnits(row: TargetForPublishing, settings: SentUnitsSettings) {
  if (
    row.target.status !== "published" ||
    row.target.pauseRequested ||
    row.store.status !== "connected"
  )
    return 0;
  if (unavailableReason(row.availability) !== null) return 0;
  if (
    row.source.catalogKind === "supplier" &&
    storeSupplierRefusal(row.store.supplierId, row.product.supplierId) === "other_supplier"
  )
    return 0;
  return unitsToSend(row, settings);
}

async function readState(dependencies: Dependencies, scope: PublicationScope) {
  const row = await getTargetForPublishing(dependencies.database, scope.tenantId, scope.targetId);
  return {
    row,
    stock: liveUnits(row, dependencies),
    priceCents: row.listing.priceCents,
  };
}

function sameValues(left: StockValues | undefined, right: StockValues): boolean {
  return left !== undefined && left.stock === right.stock && left.priceCents === right.priceCents;
}

function recordedValues(row: TargetForPublishing): StockValues | undefined {
  if (row.target.syncedStock === null || row.target.syncedPriceCents === null) return undefined;
  return { stock: row.target.syncedStock, priceCents: row.target.syncedPriceCents };
}

async function syncOnce(
  dependencies: Dependencies,
  scope: PublicationScope,
  sent: StockValues | undefined,
) {
  let state = await readState(dependencies, scope);
  let confirmed = sent ?? recordedValues(state.row);
  if (!sameValues(confirmed, state)) {
    await dependencies.acquireRateLimit(storeRateKey(state.row.store));
    // The store's queue can wait for seconds; never send the count read before that wait.
    state = await readState(dependencies, scope);
    const credentials = resolveStoreCredentials(dependencies.cipher, state.row.store);
    const externalId = state.row.target.externalId;
    if (credentials === null || externalId === null)
      throw new Error("Publication credentials are unavailable.");
    await dependencies.connectors[state.row.store.marketplace].updateStockPrice(credentials, {
      externalId,
      stock: state.stock,
      priceCents: state.priceCents,
    });
    confirmed = { stock: state.stock, priceCents: state.priceCents };
  }
  if (confirmed === undefined) throw new Error("Publication stock could not be confirmed.");
  await markTargetSynced(dependencies.database, scope.targetId, confirmed);
  return confirmed;
}

/** Reconcile after remote creation and on retries without ever issuing a second creation. */
export async function reconcilePublicationStock(
  dependencies: Dependencies,
  scope: PublicationScope,
) {
  let sent = scope.sent;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const confirmed = await syncOnce(dependencies, scope, sent);
      const latest = await readState(dependencies, scope);
      if (sameValues(confirmed, latest)) return latest.row.target.status;
      // An archive or sale during the remote update needs a compensating update immediately.
      sent = confirmed;
    }
    throw new Error("Publication changed during synchronization. Retry the stock update.");
  } catch (error) {
    await markTargetSyncFailed(
      dependencies.database,
      scope.targetId,
      userMessageOr(error, "Could not confirm publication stock."),
    );
    throw error;
  }
}
