import {
  adminConfirmProductCsvSchema,
  adminProductCsvSchema,
  adminSaveProductSchema,
  adminSaveSupplierSchema,
  adminSetProductActiveSchema,
  adminSetSupplierActiveSchema,
  adminSupplierIdSchema,
  adminSupplierProductsSchema,
  adminSupplierSearchSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { adminMiddleware } from "@/lib/server/middleware";
import {
  activeAction,
  recordCatalogWrite,
  savedAction,
} from "@/features/admin-audit/catalog-audit.server";
import {
  confirmAdminProductCsv,
  loadAdminProducts,
  loadAdminSupplier,
  loadAdminSuppliers,
  previewAdminProductCsv,
  writeAdminProduct,
  writeAdminSupplier,
  writeProductActive,
  writeSupplierActive,
} from "./suppliers.server";

export const adminListSuppliers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminSupplierSearchSchema)
  .handler(async ({ data }) => await loadAdminSuppliers(data));
export const adminGetSupplier = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminSupplierIdSchema)
  .handler(async ({ data }) => await loadAdminSupplier(data.supplierId));
export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminSupplierProductsSchema)
  .handler(async ({ data }) => await loadAdminProducts(data));
export const adminSaveSupplier = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSaveSupplierSchema)
  .handler(async ({ context, data }) => {
    const supplier = await writeAdminSupplier(data);
    await recordCatalogWrite(context.userId, {
      entityType: "supplier",
      entityId: supplier.id,
      action: savedAction("supplier", data.supplierId),
    });
    return supplier;
  });
export const adminSetSupplierActive = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSetSupplierActiveSchema)
  .handler(async ({ context, data }) => {
    const supplier = await writeSupplierActive(data);
    await recordCatalogWrite(context.userId, {
      entityType: "supplier",
      entityId: data.supplierId,
      action: activeAction("supplier", data.active),
      details: { pausedTargets: supplier.pausedTargets },
    });
    return supplier;
  });
export const adminSaveProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSaveProductSchema)
  .handler(async ({ context, data }) => {
    const saved = await writeAdminProduct(data);
    await recordCatalogWrite(context.userId, {
      entityType: "product",
      entityId: saved.product.id,
      action: savedAction("product", data.productId),
    });
    return saved;
  });
export const adminSetProductActive = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSetProductActiveSchema)
  .handler(async ({ context, data }) => {
    const product = await writeProductActive(data);
    await recordCatalogWrite(context.userId, {
      entityType: "product",
      entityId: data.productId,
      action: activeAction("product", data.active),
      details: { pausedTargets: product.pausedTargets },
    });
    return product;
  });
export const adminPreviewProductCsv = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminProductCsvSchema)
  .handler(async ({ data }) => await previewAdminProductCsv(data));
export const adminConfirmProductCsv = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminConfirmProductCsvSchema)
  .handler(async ({ context, data }) => {
    const imported = await confirmAdminProductCsv(data);
    await recordCatalogWrite(context.userId, {
      entityType: "supplier",
      entityId: data.supplierId,
      action: "catalog.csv_imported",
      details: { created: imported.created, updated: imported.updated },
    });
    return imported;
  });
