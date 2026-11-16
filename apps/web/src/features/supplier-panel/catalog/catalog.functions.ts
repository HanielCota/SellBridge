import {
  catalogListInputSchema,
  catalogProductRefSchema,
  catalogRejectSchema,
  catalogSaveDraftSchema,
  catalogSetActiveSchema,
  mercadoLivreCategoryIdSchema,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { freeText } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recordCatalogWrite } from "@/features/admin-audit/catalog-audit.server";
import { blockedContactLogging } from "@/lib/server/blocked-contact-logging";
import { adminMiddleware, supplierPanelMiddleware } from "@/lib/server/middleware";
import {
  loadPanelProductForm,
  loadPanelProducts,
  writePanelActive,
  writePanelApproval,
  writePanelDeletion,
  writePanelDraft,
  writePanelRejection,
  writePanelSubmission,
} from "./catalog.server";
import { assertSupplierAcceptsProducts } from "./supplier-active-guard";
import {
  mercadoLivreCategoryFields,
  suggestMercadoLivreCategories,
} from "./mercado-livre-ficha.server";

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

/** Mercado Livre's categories for a product title; null when Mercado Livre did not answer. */
export const supplierPanelSuggestMercadoLivreCategories = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(z.object({ supplierId: z.uuid(), title: freeText().trim().min(3).max(300) }))
  .handler(async ({ data }) => await suggestMercadoLivreCategories(data.title));

/** The technical sheet Mercado Livre shows for a category; null when it did not answer. */
export const supplierPanelMercadoLivreCategoryFields = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(z.object({ supplierId: z.uuid(), categoryId: mercadoLivreCategoryIdSchema }))
  .handler(async ({ data }) => await mercadoLivreCategoryFields(data.categoryId));

export const supplierPanelSaveDraft = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware, blockedContactLogging("supplier_panel")])
  .validator(catalogSaveDraftSchema)
  .handler(async ({ data }) => {
    await assertSupplierAcceptsProducts(data.supplierId);
    return await writePanelDraft(data);
  });

export const supplierPanelSubmitProduct = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(catalogProductRefSchema)
  .handler(async ({ data }) => {
    await assertSupplierAcceptsProducts(data.supplierId);
    return await writePanelSubmission(data);
  });

/** A switched-off supplier can still take products off sale, but not put them back. */
export const supplierPanelSetProductActive = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(catalogSetActiveSchema)
  .handler(async ({ data }) => {
    if (data.active) {
      await assertSupplierAcceptsProducts(data.supplierId);
    }
    return await writePanelActive(data);
  });

/** Deleting stays open to a switched-off supplier: it only removes what nobody sold. */
export const supplierPanelDeleteProduct = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(catalogProductRefSchema)
  .handler(async ({ data }) => await writePanelDeletion(data));

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
