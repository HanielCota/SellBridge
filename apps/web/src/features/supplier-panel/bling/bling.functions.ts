import { erpResellerCostsSchema } from "@sellbridge/shared/erp-catalog";
import { MAX_RESELLER_DISCOUNT_TENTHS } from "@sellbridge/shared/erp-reseller-price";
import { supplierImportSupplierSchema } from "@sellbridge/shared/supplier-panel-import-schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { accountMiddleware, supplierPanelMiddleware } from "@/lib/server/middleware";
import { assertSupplierProfile } from "@/lib/server/supplier-panel-access";
import {
  buildBlingNewProductsCsv,
  discardBlingRead,
  disconnectBling,
  findOwnBlingToReconnect,
  importBlingRead,
  setBlingInvoicing,
  loadBlingOverview,
  loadBlingReadRows,
  requestBlingCatalogExport,
  startBlingRead,
} from "./bling-import.server";
import { loadOnBehalfOperations, saveOnBehalfOperations } from "./bling-operations.server";

const blingReadSchema = supplierImportSupplierSchema.extend({ readId: z.uuid() });

/** The Bling card: off, not connected, connected, and the latest catalog read with its progress. */
export const supplierBlingOverview = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await loadBlingOverview(data.supplierId));

/** The header notice: whether the tab's supplier has to reconnect its Bling, and where to. */
export const ownBlingToReconnect = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    assertSupplierProfile(context.profileKind);
    return findOwnBlingToReconnect(context);
  });

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
  .handler(async ({ data, context }) => {
    await requestBlingCatalogExport({
      supplierId: data.supplierId,
      actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
    });
    return { queued: true };
  });

/** Turns the NF-e through Bling on or off for the supplier's new orders. */
export const supplierBlingSetInvoicing = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema.extend({ enabled: z.boolean() }))
  .handler(
    async ({ data, context }) =>
      await setBlingInvoicing({
        supplierId: data.supplierId,
        enabled: data.enabled,
        actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
      }),
  );

/** Forgets the supplier's Bling account; the imported products stay. */
export const supplierBlingDisconnect = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data, context }) => {
    await disconnectBling({
      supplierId: data.supplierId,
      actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
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

/** The venda à ordem operations of the supplier's Bling, with the two chosen ones. */
export const supplierBlingOnBehalfOperations = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierImportSupplierSchema)
  .handler(async ({ data }) => await loadOnBehalfOperations(data.supplierId));

const operationIdSchema = z.number().int().positive();

/** Saves the Bling operations of the remessa and of the sale to the reseller. */
export const supplierBlingSaveOnBehalfOperations = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(
    supplierImportSupplierSchema.extend({
      shipmentOperationId: operationIdSchema,
      saleOperationId: operationIdSchema,
    }),
  )
  .handler(
    async ({ data, context }) =>
      await saveOnBehalfOperations({
        ...data,
        actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
      }),
  );
