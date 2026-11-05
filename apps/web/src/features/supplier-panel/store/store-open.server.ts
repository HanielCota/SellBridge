import { setSupplierStoreOpen } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";

/**
 * Opens or closes the supplier's store, then asks the worker to push stock right away: zero to
 * every reseller listing on closing, the real stock back on opening. A missing queue only delays
 * it to the scheduled sync.
 */
export async function writeStoreOpen(input: { supplierId: string; open: boolean }) {
  const result = await setSupplierStoreOpen(database, { ...input, now: new Date() });
  logger.info("supplier_panel.store_open_changed", {
    supplierId: input.supplierId,
    open: input.open,
  });
  await requestStockSync("supplier_panel.store_open_sync_deferred");
  return result;
}
