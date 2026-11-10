import {
  failErpCatalogRead,
  finishErpCatalogRead,
  recordErpCatalogReadProgress,
} from "@sellbridge/database/repositories";
import { isMarketplaceAuthError } from "@sellbridge/marketplaces";
import { BLING_RECONNECT_MESSAGE, readBlingCatalog } from "@sellbridge/marketplaces/bling";
import {
  MAX_ERP_READ_ITEMS,
  MAX_ERP_READ_PRODUCTS,
  erpCatalogReadResultSchema,
} from "@sellbridge/shared/erp-catalog";
import { logger } from "@sellbridge/shared/logger";
import { erpCatalogReadJobSchema } from "@sellbridge/shared/queues";
import { supplierBlingClient, type ErpBlingDependencies } from "./erp-bling-client.ts";

const UNAVAILABLE_MESSAGE = "A integração com o Bling não está disponível no momento.";
const FAILED_MESSAGE = "Não foi possível ler o seu Bling agora. Tente de novo em alguns minutos.";

function failureMessage(error: unknown): string {
  if (isMarketplaceAuthError(error)) {
    return BLING_RECONNECT_MESSAGE;
  }
  return FAILED_MESSAGE;
}

/**
 * Reads the supplier's Bling catalog into its read row, reporting progress after each product so
 * the import page can show it; the supplier may leave and come back. A failure ends the read with
 * a short reason instead of retrying: the supplier starts a new read when they want.
 */
export function createErpCatalogReadProcessor(dependencies: ErpBlingDependencies) {
  return async function processErpCatalogRead(data: unknown): Promise<"ready" | "failed"> {
    const { supplierId, readId } = erpCatalogReadJobSchema.parse(data);
    const credentials = dependencies.blingCredentials;
    if (credentials === null) {
      logger.warn("erp.catalog_read_unconfigured", { supplierId });
      await failErpCatalogRead(dependencies.database, { readId, error: UNAVAILABLE_MESSAGE });
      return "failed";
    }
    const client = supplierBlingClient(
      { ...dependencies, blingCredentials: credentials },
      supplierId,
    );
    try {
      const catalog = await readBlingCatalog(client, {
        maxProducts: MAX_ERP_READ_PRODUCTS,
        maxItems: MAX_ERP_READ_ITEMS,
        onProgress: async ({ read, total }) => {
          await recordErpCatalogReadProgress(dependencies.database, {
            readId,
            readProducts: read,
            totalProducts: total,
          });
        },
      });
      const result = erpCatalogReadResultSchema.parse(catalog);
      await finishErpCatalogRead(dependencies.database, { readId, result });
      logger.info("erp.catalog_read", {
        supplierId,
        items: result.items.length,
        skipped: result.skipped.length,
        truncated: result.truncated,
      });
      return "ready";
    } catch (error) {
      logger.warn("erp.catalog_read_failed", { supplierId, error });
      await failErpCatalogRead(dependencies.database, { readId, error: failureMessage(error) });
      return "failed";
    }
  };
}
