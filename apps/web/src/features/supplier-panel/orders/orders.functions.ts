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
import { adminMiddleware } from "@/lib/server/middleware";
import {
  acceptSupplierShipments,
  loadSupplierShipment,
  loadSupplierShipmentCounts,
  loadSupplierShipments,
  writeSupplierShipmentUpdate,
} from "./orders.server";

/*
 * TEMPORARY GATE: the supplier login is built in another chat. Until its supplier middleware
 * exists, these functions only answer platform admins, so a `supplierId` sent by anyone else
 * reaches nothing. The access work swaps `adminMiddleware` for the supplier one and checks that
 * the `supplierId` is the session's own.
 */
const panelMiddleware = adminMiddleware;

export const listSupplierShipmentsFn = createServerFn({ method: "GET" })
  .middleware([panelMiddleware])
  .validator(supplierShipmentsSearchSchema)
  .handler(async ({ data }) => await loadSupplierShipments(data));

export const countSupplierShipmentsFn = createServerFn({ method: "GET" })
  .middleware([panelMiddleware])
  .validator(supplierShipmentCountsSchema)
  .handler(async ({ data }) => await loadSupplierShipmentCounts(data));

export const getSupplierPanelShipmentFn = createServerFn({ method: "GET" })
  .middleware([panelMiddleware])
  .validator(supplierShipmentDetailSchema)
  .handler(async ({ data }) => await loadSupplierShipment(data));

export const updateSupplierPanelShipmentFn = createServerFn({ method: "POST" })
  .middleware([panelMiddleware])
  .validator(z.object({ supplierId: supplierIdSchema, update: shipmentUpdateSchema }))
  .handler(async ({ data }) => await writeSupplierShipmentUpdate(data));

export const acceptSupplierShipmentsFn = createServerFn({ method: "POST" })
  .middleware([panelMiddleware])
  .validator(batchAcceptSchema)
  .handler(async ({ data }) => await acceptSupplierShipments(data));
