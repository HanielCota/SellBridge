import {
  supplierImportConfirmSchema,
  supplierImportPreviewSchema,
  supplierImportSupplierSchema,
} from "@sellbridge/shared/supplier-panel-import-schemas";
import { createServerFn } from "@tanstack/react-start";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import {
  confirmSupplierImport,
  loadSupplierImportFiles,
  previewSupplierImport,
} from "./supplier-import.server";

export const supplierImportPreview = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportPreviewSchema)
  .handler(async ({ data }) => await previewSupplierImport(data));

export const supplierImportConfirm = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportConfirmSchema)
  .handler(async ({ data }) => await confirmSupplierImport(data));

export const supplierImportFiles = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await loadSupplierImportFiles(data.supplierId));
