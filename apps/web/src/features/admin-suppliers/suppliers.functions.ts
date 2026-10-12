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
  .handler(async ({ data }) => await writeAdminSupplier(data));
export const adminSetSupplierActive = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSetSupplierActiveSchema)
  .handler(async ({ data }) => await writeSupplierActive(data));
export const adminSaveProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSaveProductSchema)
  .handler(async ({ data }) => await writeAdminProduct(data));
export const adminSetProductActive = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminSetProductActiveSchema)
  .handler(async ({ data }) => await writeProductActive(data));
export const adminPreviewProductCsv = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminProductCsvSchema)
  .handler(async ({ data }) => await previewAdminProductCsv(data));
export const adminConfirmProductCsv = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminConfirmProductCsvSchema)
  .handler(async ({ data }) => await confirmAdminProductCsv(data));
