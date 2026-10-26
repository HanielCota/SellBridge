import { loadProductCategories } from "@/lib/server/reference-data";
import {
  approveSupplierPanelProduct,
  getSupplierPanelProduct,
  listSupplierPanelProducts,
  rejectSupplierPanelProduct,
  reserveShortItems,
  saveSupplierPanelDraft,
  submitSupplierPanelProduct,
} from "@sellbridge/database/repositories";
import { AppError, hasErrorCode, isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type {
  CatalogListSearch,
  CatalogProductRef,
  CatalogRejectInput,
  CatalogSaveDraftInput,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";

export async function loadPanelProducts(input: CatalogListSearch & { supplierId: string }) {
  return await listSupplierPanelProducts(database, input);
}

/** The product being edited (or none for a new one) and the categories to choose from. */
export async function loadPanelProductForm(input: {
  supplierId: string;
  productId?: string | undefined;
}) {
  const [product, categories] = await Promise.all([
    input.productId === undefined
      ? Promise.resolve(null)
      : getSupplierPanelProduct(database, {
          supplierId: input.supplierId,
          productId: input.productId,
        }),
    loadProductCategories(),
  ]);
  return { product, categories };
}

/** Database failures become one clear message; typed errors pass through unchanged. */
async function panelWrite<TResult>(event: string, write: () => Promise<TResult>): Promise<TResult> {
  try {
    return await write();
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    logger.error(event, { error });
    throw new AppError("CONFLICT", "Não foi possível salvar o produto, tente de novo.", {
      cause: error,
    });
  }
}

/**
 * An approved product's stock and cost reach the resellers' listings: paid items that came up
 * short get the new units first, then the worker syncs. Both run after the save committed.
 */
async function propagateApprovedChange(productId: string): Promise<void> {
  try {
    await reserveShortItems(database, [productId]);
  } catch (error) {
    logger.error("supplier_panel.short_reservation_failed", { productId, error });
  }
  await requestStockSync("supplier_panel.catalog_sync_deferred");
}

/**
 * Autosave answers a conflict (another tab, a sale) as a result, not an error: the form must
 * stop saving and tell the supplier, and a server function error reaches the browser without
 * its code.
 */
export async function writePanelDraft(input: CatalogSaveDraftInput) {
  const result = await panelWrite("supplier_panel.draft_save_failed", async () => {
    try {
      return { saved: true as const, product: await saveSupplierPanelDraft(database, input) };
    } catch (error) {
      if (hasErrorCode(error, "CONFLICT")) {
        return { saved: false as const, conflict: error.message };
      }
      throw error;
    }
  });
  if (result.saved && result.product.reviewStatus === "approved") {
    await propagateApprovedChange(result.product.id);
  }
  return result;
}

export async function writePanelSubmission(ref: CatalogProductRef) {
  return await panelWrite(
    "supplier_panel.submit_failed",
    async () => await submitSupplierPanelProduct(database, ref),
  );
}

export async function writePanelApproval(ref: CatalogProductRef, reviewerId: string) {
  const product = await panelWrite(
    "supplier_panel.approve_failed",
    async () => await approveSupplierPanelProduct(database, { ...ref, reviewerId }),
  );
  await propagateApprovedChange(product.id);
  return product;
}

export async function writePanelRejection(input: CatalogRejectInput, reviewerId: string) {
  return await panelWrite(
    "supplier_panel.reject_failed",
    async () => await rejectSupplierPanelProduct(database, { ...input, reviewerId }),
  );
}
