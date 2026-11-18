import type { Database } from "@sellbridge/database";
import {
  checkStoreBuyerAddress,
  findStoresDueForBuyerAddressCheck,
} from "@sellbridge/database/repositories";
import type { StoreCredentials } from "@sellbridge/marketplaces";
import type { AccountAddress, BuyerAddressResult } from "@sellbridge/shared/buyer-address";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { decryptStoreCredentials, storeRateKey } from "../lib/store-access.ts";

export interface BuyerAddressCheckDependencies {
  database: Database;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
  /** The store account's addresses, read from Mercado Livre. */
  readAddresses: (store: StoreCredentials) => Promise<readonly AccountAddress[]>;
  now?: () => Date;
}

/**
 * Stores checked per run. The run is hourly and each store is due once a day, so a busy day is
 * spread over the hours instead of calling every account at once.
 */
export const BUYER_ADDRESS_CHECKS_PER_RUN = 200;

export type BuyerAddressRunSummary = Record<BuyerAddressResult, number>;

function emptySummary(): BuyerAddressRunSummary {
  return { ok: 0, supplier_address: 0, shipping_address: 0, no_buying_address: 0, not_checked: 0 };
}

/**
 * Checks again the purchase address of each connected Mercado Livre store due for it. A store
 * whose address went back to a supplier's is held and its workspace notified (by the repository);
 * an unreadable account keeps its last verdict until the next day.
 */
export function createBuyerAddressCheckProcessor(dependencies: BuyerAddressCheckDependencies) {
  const now = dependencies.now ?? (() => new Date());
  return async function processBuyerAddressChecks(): Promise<BuyerAddressRunSummary> {
    const due = await findStoresDueForBuyerAddressCheck(dependencies.database, {
      now: now(),
      limit: BUYER_ADDRESS_CHECKS_PER_RUN,
    });
    const summary = emptySummary();
    // Sequential on purpose: one call per store, each under that store's marketplace quota.
    for (const store of due) {
      const result = await checkStoreBuyerAddress(dependencies.database, {
        storeConnectionId: store.id,
        readAddresses: async () => {
          await dependencies.acquireRateLimit(storeRateKey(store));
          return dependencies.readAddresses(decryptStoreCredentials(dependencies.cipher, store));
        },
        now: now(),
      });
      summary[result] += 1;
    }
    if (due.length > 0) {
      // Field names without "address": the logger hides any field named after one.
      logger.info("store.buyer_address_check_run", {
        checked: due.length,
        fine: summary.ok,
        held: summary.supplier_address,
        warned: summary.shipping_address,
        unmarked: summary.no_buying_address,
        unread: summary.not_checked,
      });
    }
    return summary;
  };
}
