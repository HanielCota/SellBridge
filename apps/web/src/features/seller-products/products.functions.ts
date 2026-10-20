import {
  activateSellerProduct,
  archiveSellerProduct,
  duplicateSellerProduct,
  listSellerProducts,
  listAdminCatalogProducts,
  actOnAdminSellerProduct,
  inspectSellerProduct,
  setAdminSellerPublicationsPaused,
} from "@sellbridge/database/repositories";
import {
  adminProductReasonSchema,
  adminSellerProductScopeSchema,
  adminSaveSellerProductSchema,
  sellerDuplicateProductSchema,
  sellerProductListSearchSchema,
  sellerProductRefSchema,
  sellerSaveProductSchema,
} from "@sellbridge/shared/seller-catalog-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { adminMiddleware, tenantMiddleware } from "@/lib/server/middleware";
import {
  assertOwnerProductWrite,
  loadSellerProductForm,
  propagateSellerProduct,
  writeSellerProduct,
} from "./products.server";

export const sellerListProductsFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(sellerProductListSearchSchema)
  .handler(async ({ context, data }) => listSellerProducts(database, context.tenantId, data));
export const sellerProductFormFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(sellerProductRefSchema)
  .handler(async ({ context, data }) => loadSellerProductForm(context.tenantId, data.productId));
export const sellerSaveProductFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(sellerSaveProductSchema)
  .handler(async ({ context, data }) => {
    assertOwnerProductWrite(context);
    return writeSellerProduct(context.tenantId, data);
  });
export const sellerActivateProductFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(sellerProductRefSchema)
  .handler(async ({ context, data }) => {
    assertOwnerProductWrite(context);
    const product = await activateSellerProduct(database, context.tenantId, data.productId);
    await propagateSellerProduct(product.id);
    return product;
  });
export const sellerArchiveProductFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(sellerProductRefSchema)
  .handler(async ({ context, data }) => {
    assertOwnerProductWrite(context);
    const result = await archiveSellerProduct(database, context.tenantId, data.productId);
    await propagateSellerProduct(data.productId);
    return result;
  });
export const sellerDuplicateProductFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(sellerDuplicateProductSchema)
  .handler(async ({ context, data }) => {
    assertOwnerProductWrite(context);
    return duplicateSellerProduct(database, context.tenantId, data);
  });

export const adminProductListSearchSchema = sellerProductListSearchSchema
  .omit({ status: true })
  .extend({
    origin: z.enum(["all", "seller", "supplier"]).default("all"),
    tenantId: z.string().min(1).max(200).optional(),
  });
const adminRef = adminSellerProductScopeSchema.extend(sellerProductRefSchema.shape);
const adminAction = adminRef.extend({
  reason: adminProductReasonSchema,
  action: z.enum(["activate", "archive", "block", "unblock"]),
});
export const adminListCatalogProductsFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminProductListSearchSchema)
  .handler(async ({ data }) => listAdminCatalogProducts(database, data));
export const adminSellerProductFormFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminRef)
  .handler(async ({ data }) => loadSellerProductForm(data.tenantId, data.productId));
export const adminSaveSellerProductFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSaveSellerProductSchema)
  .handler(async ({ context, data }) =>
    writeSellerProduct(data.tenantId, data, { userId: context.userId, reason: data.reason }),
  );
export const adminActOnSellerProductFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminAction)
  .handler(async ({ context, data }) => {
    const product = await actOnAdminSellerProduct(database, { ...data, adminId: context.userId });
    await propagateSellerProduct(product.id);
    return product;
  });
export const adminInspectSellerProductFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminRef)
  .handler(async ({ data }) => inspectSellerProduct(database, data.tenantId, data.productId));
export const adminPauseSellerPublicationsFn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminRef.extend({ reason: adminProductReasonSchema, paused: z.boolean() }))
  .handler(async ({ context, data }) => {
    const changed = await setAdminSellerPublicationsPaused(database, {
      ...data,
      adminId: context.userId,
    });
    await propagateSellerProduct(data.productId);
    return changed;
  });
