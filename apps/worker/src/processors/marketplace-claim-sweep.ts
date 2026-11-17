import type { Database } from "@sellbridge/database";
import { listClaimSweepStores } from "@sellbridge/database/repositories";
import type { ClaimSearchFilter, StoreCredentials } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { decryptStoreCredentials, expireStoreOnAuthError } from "../lib/store-access.ts";
import { type ClaimSync, type NoticeReaders, syncStoreClaim } from "./marketplace-notice.ts";

export interface ClaimSweepDependencies {
  database: Database;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
  readers: Pick<NoticeReaders, "readClaim" | "readShipmentOrders">;
  searchClaims: (store: StoreCredentials, filter: ClaimSearchFilter) => Promise<string[]>;
  now?: () => Date;
}

/**
 * The run is daily; a little more than a day back covers a run that started late. Open claims
 * are read whatever their age, so the first run also picks up claims of orders already sold.
 */
const RECENT_WINDOW_MILLISECONDS = 26 * 60 * 60 * 1000;
/** Most claims read per store and run: the rest wait for the next run or a notification. */
const MAX_CLAIMS_PER_STORE = 200;

type StoreRow = Awaited<ReturnType<typeof listClaimSweepStores>>[number];
type ClaimOutcome = ClaimSync | "failed";

async function claimIdsOf(
  dependencies: ClaimSweepDependencies,
  credentials: StoreCredentials,
  now: Date,
): Promise<string[]> {
  const updatedAfter = new Date(now.getTime() - RECENT_WINDOW_MILLISECONDS);
  const open = await dependencies.searchClaims(credentials, { status: "opened" });
  const recent = await dependencies.searchClaims(credentials, { updatedAfter });
  return [...new Set([...open, ...recent])].slice(0, MAX_CLAIMS_PER_STORE);
}

async function sweepStore(
  dependencies: ClaimSweepDependencies,
  row: StoreRow,
  now: Date,
): Promise<ClaimOutcome[]> {
  if (row.accessTokenEnc === null) {
    return [];
  }
  try {
    const credentials = decryptStoreCredentials(dependencies.cipher, {
      externalShopId: row.externalShopId,
      accessTokenEnc: row.accessTokenEnc,
    });
    const run = {
      dependencies,
      marketplace: "mercado_livre" as const,
      store: { id: row.id, tenantId: row.tenantId },
      credentials,
    };
    const outcomes: ClaimOutcome[] = [];
    for (const claimId of await claimIdsOf(dependencies, credentials, now)) {
      try {
        outcomes.push(await syncStoreClaim(run, claimId));
      } catch (error) {
        logger.warn("claim.sweep_claim_failed", { storeConnectionId: row.id, claimId, error });
        outcomes.push("failed");
      }
    }
    return outcomes;
  } catch (error) {
    logger.warn("claim.sweep_store_failed", { storeConnectionId: row.id, error });
    await expireStoreOnAuthError(
      dependencies.database,
      { id: row.id, accessTokenEnc: row.accessTokenEnc },
      error,
    );
    return ["failed"];
  }
}

/**
 * Safety net for claim notifications: once a day, every connected Mercado Livre store's open
 * claims and the ones updated since the last run are read again and stored.
 */
export function createClaimSweepProcessor(dependencies: ClaimSweepDependencies) {
  return async function processClaimSweep() {
    const now = (dependencies.now ?? (() => new Date()))();
    const stores = await listClaimSweepStores(dependencies.database);
    const outcomes: ClaimOutcome[] = [];
    // One store at a time: each claim costs the store a few marketplace calls.
    for (const row of stores) {
      outcomes.push(...(await sweepStore(dependencies, row, now)));
    }
    const summary = {
      stores: stores.length,
      saved: outcomes.filter((outcome) => outcome === "saved").length,
      outsideSellBridge: outcomes.filter((outcome) => outcome === "outside_sellbridge").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
    };
    logger.info("claim.sweep_run", summary);
    return summary;
  };
}
