import {
  catalogListInputSchema,
  catalogProductRefSchema,
  catalogRejectSchema,
  catalogSaveDraftSchema,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recordCatalogWrite } from "@/features/admin-audit/catalog-audit.server";
import { blockedContactLogging } from "@/lib/server/blocked-contact-logging";
import { adminMiddleware, supplierPanelMiddleware } from "@/lib/server/middleware";
import {
  loadPanelProductForm,
  loadPanelProducts,
  writePanelApproval,
  writePanelDraft,
  writePanelRejection,
  writePanelSubmission,
} from "./catalog.server";

const productFormInputSchema = z.object({
  supplierId: z.uuid(),
  productId: z.uuid().optional(),
});

export const supplierPanelListProducts = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(catalogListInputSchema)
  .handler(async ({ data }) => await loadPanelProducts(data));

export const supplierPanelGetProductForm = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(productFormInputSchema)
  .handler(async ({ data }) => await loadPanelProductForm(data));

export const supplierPanelSaveDraft = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware, blockedContactLogging("supplier_panel")])
  .validator(catalogSaveDraftSchema)
  .handler(async ({ data }) => await writePanelDraft(data));

export const supplierPanelSubmitProduct = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
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
