import { supplierImportSupplierSchema } from "@sellbridge/shared/supplier-panel-import-schemas";
import { createServerFn } from "@tanstack/react-start";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { previewBlingImport, requestBlingCatalogExport } from "./bling-import.server";

/** The Bling catalog as an import preview; `supplierImportConfirm` imports it. */
export const supplierBlingImportPreview = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await previewBlingImport(data.supplierId));

/** Creates in Bling, in the background, the supplier's products it does not have yet. */
export const supplierBlingSendCatalog = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => {
    await requestBlingCatalogExport(data.supplierId);
    return { queued: true };
  });
