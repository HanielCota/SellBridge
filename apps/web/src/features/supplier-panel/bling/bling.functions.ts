import { erpCatalogItemsSchema, erpResellerCostsSchema } from "@sellbridge/shared/erp-catalog";
import { supplierImportSupplierSchema } from "@sellbridge/shared/supplier-panel-import-schemas";
import { createServerFn } from "@tanstack/react-start";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import {
  previewBlingImport,
  previewBlingImportWithCosts,
  requestBlingCatalogExport,
} from "./bling-import.server";

/** The Bling catalog planned for import; `supplierImportConfirm` imports its `preview`. */
export const supplierBlingImportPreview = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await previewBlingImport(data.supplierId));

const blingImportWithCostsSchema = supplierImportSupplierSchema.extend({
  items: erpCatalogItemsSchema,
  costs: erpResellerCostsSchema,
});

/** The plan again with the reseller prices typed for new products. */
export const supplierBlingImportWithCosts = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(blingImportWithCostsSchema)
  .handler(async ({ data }) => await previewBlingImportWithCosts(data));

/** Creates in Bling, in the background, the supplier's products it does not have yet. */
export const supplierBlingSendCatalog = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => {
    await requestBlingCatalogExport(data.supplierId);
    return { queued: true };
  });
