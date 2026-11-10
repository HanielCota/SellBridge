import { erpResellerCostsSchema } from "@sellbridge/shared/erp-catalog";
import { MAX_RESELLER_DISCOUNT_TENTHS } from "@sellbridge/shared/erp-reseller-price";
import { supplierImportSupplierSchema } from "@sellbridge/shared/supplier-panel-import-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import {
  buildBlingNewProductsCsv,
  discardBlingRead,
  disconnectBling,
  importBlingRead,
  loadBlingOverview,
  loadBlingReadRows,
  requestBlingCatalogExport,
  startBlingRead,
} from "./bling-import.server";

const blingReadSchema = supplierImportSupplierSchema.extend({ readId: z.uuid() });

/** The Bling card: off, not connected, connected, and the latest catalog read with its progress. */
export const supplierBlingOverview = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await loadBlingOverview(data.supplierId));

/** Starts reading the catalog in the background; the page polls the overview for progress. */
export const supplierBlingStartRead = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await startBlingRead(data.supplierId));

/** The products of a finished read, each with its current reseller price or the need for one. */
export const supplierBlingReadRows = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(blingReadSchema)
  .handler(async ({ data }) => await loadBlingReadRows(data.supplierId, data.readId));

/** The new products as a spreadsheet to fill the reseller price in Excel. */
export const supplierBlingNewProductsCsv = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(blingReadSchema)
  .handler(async ({ data }) => ({
    csv: await buildBlingNewProductsCsv(data.supplierId, data.readId),
  }));

const blingImportSchema = blingReadSchema.extend({
  costs: erpResellerCostsSchema,
  resellerDiscountTenths: z.number().int().min(0).max(MAX_RESELLER_DISCOUNT_TENTHS).nullable(),
});

/** Imports the read with the reseller prices typed for new products. */
export const supplierBlingImport = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(blingImportSchema)
  .handler(async ({ data }) => await importBlingRead(data));

/** Creates in Bling, in the background, the supplier's products it does not have yet. */
export const supplierBlingSendCatalog = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => {
    await requestBlingCatalogExport(data.supplierId);
    return { queued: true };
  });

/** Forgets the supplier's Bling account; the imported products stay. */
export const supplierBlingDisconnect = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data, context }) => {
    await disconnectBling({
      supplierId: data.supplierId,
      impersonatedBy: context.impersonatedBy,
    });
    return { disconnected: true };
  });

/** Drops the finished read the supplier decided not to import. */
export const supplierBlingDiscardRead = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => {
    await discardBlingRead(data.supplierId);
    return { discarded: true };
  });
