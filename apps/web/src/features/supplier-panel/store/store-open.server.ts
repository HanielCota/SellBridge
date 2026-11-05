import { setSupplierStoreOpen } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";
import type { SupplierPanelViewer } from "@/lib/server/supplier-panel-access";

/**
 * Opens or closes the supplier's store, then asks the worker to push stock right away: zero to
 * every reseller listing on closing, the real stock back on opening. A missing queue only delays
 * it to the scheduled sync.
 */
export async function writeStoreOpen(input: {
  supplierId: string;
  open: boolean;
  /** Who flipped it: the supplier itself or the team on its behalf (the audit only logs here). */
  actor: SupplierPanelViewer["kind"];
}) {
  const result = await setSupplierStoreOpen(database, {
    supplierId: input.supplierId,
    open: input.open,
    now: new Date(),
  });
  logger.info("supplier_panel.store_open_changed", {
    supplierId: input.supplierId,
    open: input.open,
    actor: input.actor,
  });
  await requestStockSync("supplier_panel.store_open_sync_deferred");
  return result;
}
