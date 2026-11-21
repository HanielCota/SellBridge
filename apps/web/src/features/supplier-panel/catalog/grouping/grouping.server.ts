import {
  groupProducts,
  listGroupingSuggestions,
  separateGroupedModel,
} from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { GroupProductsInput } from "@sellbridge/shared/product-grouping";
import type { CatalogModelRef } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { panelWrite } from "../catalog.server";

const GROUPING_UNAVAILABLE_MESSAGE = "Juntar cores e tamanhos ainda não está disponível.";

/** Grouping is part of the grids, off until the grid listing is ready (PRODUCT_GRID_ENABLED). */
function assertGroupingEnabled(): void {
  if (environment.PRODUCT_GRID_ENABLED) {
    return;
  }
  throw notFoundError(GROUPING_UNAVAILABLE_MESSAGE);
}

/** The suggestions screen's data; switched off, it says so instead of an error to retry. */
export async function loadPanelGroupingSuggestions(input: { supplierId: string }) {
  if (!environment.PRODUCT_GRID_ENABLED) {
    return { available: false as const };
  }
  return {
    available: true as const,
    suggestions: await listGroupingSuggestions(database, input.supplierId),
  };
}

/** Problems found while grouping come back as a result, shown next to each product. */
export async function writePanelGrouping(input: GroupProductsInput, userId: string) {
  assertGroupingEnabled();
  const result = await panelWrite(
    "supplier_panel.grouping_failed",
    async () => await groupProducts(database, { ...input, groupedBy: userId }),
  );
  if (result.grouped) {
    logger.info("supplier_panel.products_grouped", {
      supplierId: input.supplierId,
      modelId: result.modelId,
      groupingId: result.groupingId,
      products: input.products.length,
    });
  }
  return result;
}

/** Separating a grouped grid gives every product its "before" back. */
export async function writePanelSeparation(ref: CatalogModelRef, userId: string) {
  assertGroupingEnabled();
  const result = await panelWrite(
    "supplier_panel.separation_failed",
    async () => await separateGroupedModel(database, { ...ref, separatedBy: userId }),
  );
  logger.info("supplier_panel.grid_separated", {
    supplierId: ref.supplierId,
    modelId: ref.modelId,
    products: result.productIds.length,
  });
  return { products: result.productIds.length };
}
