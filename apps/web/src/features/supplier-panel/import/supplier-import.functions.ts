import {
  supplierImportConfirmSchema,
  supplierImportPreviewSchema,
  supplierImportSupplierSchema,
} from "@sellbridge/shared/supplier-panel-import-schemas";
import { createServerFn } from "@tanstack/react-start";
import { assertSupplierAcceptsProducts } from "@/features/supplier-panel/catalog/supplier-active-guard";
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
  .handler(async ({ data }) => {
    await assertSupplierAcceptsProducts(data.supplierId);
    return await confirmSupplierImport(data);
  });

export const supplierImportFiles = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await loadSupplierImportFiles(data.supplierId));
