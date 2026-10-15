import type { Database } from "@sellbridge/database";
import {
  applyMarketplaceShipment,
  listShipmentsToTrack,
  touchShipmentTracking,
} from "@sellbridge/database/repositories";
import type { StoreCredentials } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import type { MarketplaceTrackingStatus } from "@sellbridge/shared/schemas";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { decryptStoreCredentials, expireStoreOnAuthError } from "../lib/store-access.ts";

/** What the marketplace says about an order's parcel (`getMercadoLivreShipping`). */
export interface TrackedShipping {
  status: string;
  trackingStatus: MarketplaceTrackingStatus | null;
  buyerReturnDelivered: boolean;
  carrier: string | null;
  trackingCode: string | null;
  estimatedDeliveryAt: Date | null;
  dispatchDeadlineAt: Date | null;
}

export interface ShipmentTrackingDependencies {
  database: Database;
  cipher: TokenCipher;
  readShipping: (store: StoreCredentials, externalOrderId: string) => Promise<TrackedShipping>;
  /** Shipped or returned parcels move stock: the sync runs once after a run that changed any. */
  requestStockSync?: () => Promise<void>;
}

/** Orders read per run: every 30 minutes, the least recently read first. */
const TRACKING_BATCH_SIZE = 100;

type TrackedRow = Awaited<ReturnType<typeof listShipmentsToTrack>>[number];
type TrackOutcome = "changed" | "unchanged" | "failed";

/** Sends the order to the back of the line; a failure here is logged, never fatal to the run. */
async function moveToBackOfLine(dependencies: ShipmentTrackingDependencies, row: TrackedRow) {
  try {
    await touchShipmentTracking(dependencies.database, row.tenantId, row.orderId);
  } catch (error) {
    logger.error("shipment.tracking_touch_failed", { orderId: row.orderId, error });
  }
}

async function trackOne(
  dependencies: ShipmentTrackingDependencies,
  row: TrackedRow,
): Promise<TrackOutcome> {
  try {
    if (row.accessTokenEnc === null) {
      throw new Error("Loja sem token de acesso");
    }
    // Inside the try: a token that no longer decrypts fails this order, not the whole run.
    const store = decryptStoreCredentials(dependencies.cipher, {
      externalShopId: row.externalShopId,
      accessTokenEnc: row.accessTokenEnc,
    });
    const shipping = await dependencies.readShipping(store, row.externalOrderId);
    const result = await applyMarketplaceShipment(
      dependencies.database,
      row.tenantId,
      row.orderId,
      shipping,
    );
    return result.changed ? "changed" : "unchanged";
  } catch (error) {
    logger.warn("shipment.tracking_failed", { orderId: row.orderId, error });
    await moveToBackOfLine(dependencies, row);
    await expireStoreOnAuthError(
      dependencies.database,
      { id: row.storeConnectionId, accessTokenEnc: row.accessTokenEnc },
      error,
    );
    return "failed";
  }
}

/** Reads the parcels of Mercado Livre orders still on their way and stores what changed. */
export function createShipmentTrackingProcessor(dependencies: ShipmentTrackingDependencies) {
  return async function processShipmentTracking() {
    const rows = await listShipmentsToTrack(dependencies.database, { limit: TRACKING_BATCH_SIZE });
    const outcomes: TrackOutcome[] = [];
    // One at a time: each order costs the store a few marketplace calls.
    for (const row of rows) {
      outcomes.push(await trackOne(dependencies, row));
    }
    const summary = {
      changed: outcomes.filter((outcome) => outcome === "changed").length,
      updated: outcomes.filter((outcome) => outcome !== "failed").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
    };
    if (summary.changed > 0 && dependencies.requestStockSync !== undefined) {
      await dependencies.requestStockSync();
    }
    logger.info("shipment.tracking_run", summary);
    return summary;
  };
}
