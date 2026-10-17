import {
  catalogListInputSchema,
  catalogProductRefSchema,
  catalogRejectSchema,
  catalogSaveDraftSchema,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recordCatalogWrite } from "@/features/admin-audit/catalog-audit.server";
import { adminMiddleware } from "@/lib/server/middleware";
import {
  loadPanelProductForm,
  loadPanelProducts,
  writePanelApproval,
  writePanelDraft,
  writePanelRejection,
  writePanelSubmission,
} from "./catalog.server";

/**
 * Supplier-side functions take `supplierId` explicitly. Until supplier accounts exist they are
 * admin-only (an admin may act for any supplier); the access work swaps `adminMiddleware` for
 * the supplier middleware, which must check the session's supplier against `data.supplierId`.
 */
const supplierPanelGuard = adminMiddleware;

const productFormInputSchema = z.object({
  supplierId: z.uuid(),
  productId: z.uuid().optional(),
});

export const supplierPanelListProducts = createServerFn({ method: "GET" })
  .middleware([supplierPanelGuard])
  .validator(catalogListInputSchema)
  .handler(async ({ data }) => await loadPanelProducts(data));

export const supplierPanelGetProductForm = createServerFn({ method: "GET" })
  .middleware([supplierPanelGuard])
  .validator(productFormInputSchema)
  .handler(async ({ data }) => await loadPanelProductForm(data));

export const supplierPanelSaveDraft = createServerFn({ method: "POST" })
  .middleware([supplierPanelGuard])
  .validator(catalogSaveDraftSchema)
  .handler(async ({ data }) => await writePanelDraft(data));

export const supplierPanelSubmitProduct = createServerFn({ method: "POST" })
  .middleware([supplierPanelGuard])
  .validator(catalogProductRefSchema)
  .handler(async ({ data }) => await writePanelSubmission(data));

/** The platform's review of a submitted product: always admin-only, and audited. */
export const adminApprovePanelProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(catalogProductRefSchema)
  .handler(async ({ context, data }) => {
    const product = await writePanelApproval(data, context.userId);
    await recordCatalogWrite(context.userId, {
      entityType: "product",
      entityId: product.id,
      action: "product.approved",
    });
    return product;
  });

export const adminRejectPanelProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(catalogRejectSchema)
  .handler(async ({ context, data }) => {
    const product = await writePanelRejection(data, context.userId);
    await recordCatalogWrite(context.userId, {
      entityType: "product",
      entityId: product.id,
      action: "product.rejected",
      details: { reasons: data.reasons.length },
    });
    return product;
  });
