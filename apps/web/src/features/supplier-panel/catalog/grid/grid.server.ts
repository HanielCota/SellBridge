import {
  deleteUnsoldProductModel,
  findSkusTakenOutsideModel,
  getProductModel,
  getSupplierTaxDefaults,
  publishProductModel,
  saveProductModelDraft,
  type ProductModelDetail,
} from "@sellbridge/database/repositories";
import { hasErrorCode, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type {
  CatalogModelRef,
  CatalogSaveModelDraftInput,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { loadProductCategories } from "@/lib/server/reference-data";
import { panelWrite, propagateApprovedChange } from "../catalog.server";

/**
 * Grids stay off until the grid listing is ready (decision of 19/11/2026): off, every grid
 * route answers as if grids did not exist, whatever a request sends.
 */
const GRIDS_UNAVAILABLE_MESSAGE = "Produtos com cores e tamanhos ainda não estão disponíveis.";

function assertProductGridEnabled(): void {
  if (environment.PRODUCT_GRID_ENABLED) {
    return;
  }
  throw notFoundError(GRIDS_UNAVAILABLE_MESSAGE);
}

function approvedCombinationIds(model: ProductModelDetail): string[] {
  return model.combinations
    .filter((combination) => combination.reviewStatus === "approved")
    .map((combination) => combination.id);
}

/**
 * The model being edited (or none for a new one), what the form chooses from and the brand's
 * niche, the category a new grid most likely belongs to. While grids are switched off it says
 * so, and the form shows it with the way back, rather than an error to retry.
 */
export async function loadPanelModelForm(input: {
  supplierId: string;
  modelId?: string | undefined;
}) {
  if (environment.PRODUCT_GRID_ENABLED) {
    return await loadAvailableModelForm(input);
  }
  return { available: false as const };
}

async function loadAvailableModelForm(input: { supplierId: string; modelId?: string | undefined }) {
  const [model, categories, taxDefaults, brand] = await Promise.all([
    input.modelId === undefined
      ? Promise.resolve(null)
      : getProductModel(database, { supplierId: input.supplierId, modelId: input.modelId }),
    loadProductCategories(),
    getSupplierTaxDefaults(database, input.supplierId),
    database.query.suppliers.findFirst({
      where: (supplier, { eq }) => eq(supplier.id, input.supplierId),
      columns: { niche: true },
    }),
  ]);
  if (input.modelId !== undefined && model === null) {
    throw notFoundError("Produto não encontrado neste fornecedor");
  }
  return {
    available: true as const,
    model,
    categories,
    taxDefaults,
    brandNiche: brand?.niche ?? null,
  };
}

/**
 * Autosave answers a conflict (another tab, a sale) as a result, not an error: the form must
 * stop saving and say why, and a server function error reaches the browser without its code. A
 * SKU another product uses is answered apart, as the field to fix: saving goes on after it.
 */
export async function writePanelModelDraft(input: CatalogSaveModelDraftInput) {
  assertProductGridEnabled();
  const result = await panelWrite("supplier_panel.model_save_failed", async () => {
    const takenSkus = await findSkusTakenOutsideModel(database, input);
    if (takenSkus.length > 0) {
      return { saved: false as const, takenSkus };
    }
    try {
      return { saved: true as const, model: await saveProductModelDraft(database, input) };
    } catch (error) {
      if (hasErrorCode(error, "CONFLICT")) {
        return { saved: false as const, conflict: error.message };
      }
      throw error;
    }
  });
  if (result.saved) {
    const approved = approvedCombinationIds(result.model);
    if (approved.length > 0) {
      await propagateApprovedChange(approved);
    }
  }
  return result;
}

/** Publishing puts every combination on sale at once (no team review). */
export async function writePanelModelPublication(ref: CatalogModelRef) {
  assertProductGridEnabled();
  const model = await panelWrite(
    "supplier_panel.model_publish_failed",
    async () => await publishProductModel(database, ref),
  );
  await propagateApprovedChange(approvedCombinationIds(model));
  logger.info("supplier_panel.model_published", {
    supplierId: ref.supplierId,
    modelId: ref.modelId,
    combinations: model.combinations.length,
  });
  return model;
}

/** Only a model nobody listed or sold; anything else is refused with a conflict. */
export async function writePanelModelDeletion(ref: CatalogModelRef) {
  assertProductGridEnabled();
  await panelWrite(
    "supplier_panel.model_delete_failed",
    async () => await deleteUnsoldProductModel(database, ref),
  );
  logger.info("supplier_panel.model_deleted", { supplierId: ref.supplierId, modelId: ref.modelId });
  return { id: ref.modelId };
}
