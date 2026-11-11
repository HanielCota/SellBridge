import {
  failErpCatalogRead,
  finishErpCatalogRead,
  isErpCatalogReadOpen,
  recordErpCatalogReadProgress,
} from "@sellbridge/database/repositories";
import { isMarketplaceAuthError } from "@sellbridge/marketplaces";
import { BLING_RECONNECT_MESSAGE, readBlingCatalog } from "@sellbridge/marketplaces/bling";
import {
  MAX_ERP_READ_CHARACTERS,
  MAX_ERP_READ_ITEMS,
  MAX_ERP_READ_PRODUCTS,
  erpCatalogReadCharacters,
  erpCatalogReadResultSchema,
} from "@sellbridge/shared/erp-catalog";
import { logger } from "@sellbridge/shared/logger";
import { erpCatalogReadJobSchema } from "@sellbridge/shared/queues";
import { supplierBlingClient, type ErpBlingDependencies } from "./erp-bling-client.ts";

const UNAVAILABLE_MESSAGE = "A integração com o Bling não está disponível no momento.";
const FAILED_MESSAGE = "Não foi possível ler o seu Bling agora. Tente de novo em alguns minutos.";
const TOO_MUCH_TEXT_MESSAGE =
  "Os produtos do seu Bling têm texto demais para importar de uma vez. Encurte as descrições das variações e tente de novo.";

/** The supplier discarded the read or started a newer one while this job was waiting or running. */
class ErpCatalogReadSupersededError extends Error {}

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
  return async function processErpCatalogRead(
    data: unknown,
  ): Promise<"ready" | "failed" | "superseded"> {
    const { supplierId, readId } = erpCatalogReadJobSchema.parse(data);
    if (!(await isErpCatalogReadOpen(dependencies.database, readId))) {
      logger.info("erp.catalog_read_superseded", { supplierId });
      return "superseded";
    }
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
          const stillOpen = await recordErpCatalogReadProgress(dependencies.database, {
            readId,
            readProducts: read,
            totalProducts: total,
          });
          if (!stillOpen) {
            throw new ErpCatalogReadSupersededError();
          }
        },
      });
      if (erpCatalogReadCharacters(catalog.items) > MAX_ERP_READ_CHARACTERS) {
        logger.warn("erp.catalog_read_too_large", { supplierId, items: catalog.items.length });
        await failErpCatalogRead(dependencies.database, { readId, error: TOO_MUCH_TEXT_MESSAGE });
        return "failed";
      }
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
      if (error instanceof ErpCatalogReadSupersededError) {
        logger.info("erp.catalog_read_superseded", { supplierId });
        return "superseded";
      }
      logger.warn("erp.catalog_read_failed", { supplierId, error });
      await failErpCatalogRead(dependencies.database, { readId, error: failureMessage(error) });
      return "failed";
    }
  };
}
