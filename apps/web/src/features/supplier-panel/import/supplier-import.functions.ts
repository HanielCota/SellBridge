import {
  supplierImportConfirmSchema,
  supplierImportPreviewSchema,
  supplierImportSupplierSchema,
} from "@sellbridge/shared/supplier-panel-import-schemas";
import { createServerFn } from "@tanstack/react-start";
import { adminMiddleware } from "@/lib/server/middleware";
import {
  confirmSupplierImport,
  loadSupplierImportFiles,
  previewSupplierImport,
} from "./supplier-import.server";

/**
 * Admin-only until the supplier access work lands: it swaps `adminMiddleware` for the supplier
 * middleware and takes `supplierId` from the session instead of the request. Until then no
 * supplier can reach these, and no endpoint is open without a login.
 */

export const supplierImportPreview = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(supplierImportPreviewSchema)
  .handler(async ({ data }) => await previewSupplierImport(data));

export const supplierImportConfirm = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(supplierImportConfirmSchema)
  .handler(async ({ data }) => await confirmSupplierImport(data));

export const supplierImportFiles = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await loadSupplierImportFiles(data.supplierId));
