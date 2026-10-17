import { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import {
  batchAcceptSchema,
  supplierIdSchema,
  supplierShipmentCountsSchema,
  supplierShipmentDetailSchema,
  supplierShipmentsSearchSchema,
} from "@sellbridge/shared/supplier-panel-orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import {
  acceptSupplierShipments,
  loadSupplierShipment,
  loadSupplierShipmentCounts,
  loadSupplierShipments,
  writeSupplierShipmentUpdate,
} from "./orders.server";

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

export const updateSupplierPanelShipmentFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(z.object({ supplierId: supplierIdSchema, update: shipmentUpdateSchema }))
  .handler(async ({ data }) => await writeSupplierShipmentUpdate(data));

export const acceptSupplierShipmentsFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(batchAcceptSchema)
  .handler(async ({ data }) => await acceptSupplierShipments(data));
