import { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import {
  batchAcceptSchema,
  batchLabelsSchema,
  supplierIdSchema,
  supplierShipmentCountsSchema,
  supplierShipmentDetailSchema,
  supplierScanSchema,
  supplierShipmentsSearchSchema,
} from "@sellbridge/shared/supplier-panel-orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { blockedContactLogging } from "@/lib/server/blocked-contact-logging";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { printSupplierLabels } from "./batch-labels.server";
import { scanSupplierShipment } from "./scan.server";
import {
  acceptSupplierShipments,
  loadSupplierResellerStores,
  loadSupplierShipment,
  loadSupplierShipmentCounts,
  loadSupplierShipments,
  writeSupplierShipmentUpdate,
} from "./orders.server";
import { loadSupplierParcelTracking } from "./parcel-tracking.server";

export const listSupplierShipmentsFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierShipmentsSearchSchema)
  .handler(async ({ data }) => await loadSupplierShipments(data));

export const countSupplierShipmentsFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierShipmentCountsSchema)
  .handler(async ({ data }) => await loadSupplierShipmentCounts(data));

export const getSupplierPanelShipmentFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierShipmentDetailSchema)
  .handler(async ({ data }) => await loadSupplierShipment(data));

export const getSupplierParcelTrackingFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierShipmentDetailSchema)
  .handler(async ({ data }) => await loadSupplierParcelTracking(data));

export const updateSupplierPanelShipmentFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware, blockedContactLogging("supplier_panel")])
  .validator(z.object({ supplierId: supplierIdSchema, update: shipmentUpdateSchema }))
  .handler(async ({ data }) => await writeSupplierShipmentUpdate(data));

export const acceptSupplierShipmentsFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(batchAcceptSchema)
  .handler(async ({ data }) => await acceptSupplierShipments(data));

export const printSupplierLabelsFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(batchLabelsSchema)
  .handler(async ({ data }) => await printSupplierLabels(data));

export const listSupplierResellerStoresFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(z.object({ supplierId: supplierIdSchema }))
  .handler(async ({ data }) => await loadSupplierResellerStores(data.supplierId));

export const scanSupplierShipmentFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierScanSchema)
  .handler(async ({ data }) => await scanSupplierShipment(data));
