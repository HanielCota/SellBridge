import {
  forwardOrder,
  getFulfillmentDetail,
  getSupplierShipment,
  listOperationalOrders,
  reforwardShipment,
  revokeSupplierLink,
  rotateSupplierLink,
} from "@sellbridge/database/repositories";
import {
  forwardOrderSchema,
  operationsSearchSchema,
  shipmentUpdateSchema,
  supplierTokenSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { writeShipmentUpdate } from "./shipments.server";

const idSchema = z.object({ orderId: z.uuid() });
export const listOperationsFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(operationsSearchSchema)
  .handler(({ context, data }) => listOperationalOrders(database, context.tenantId, data));
export const getFulfillmentFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(idSchema)
  .handler(({ context, data }) => getFulfillmentDetail(database, context.tenantId, data.orderId));
export const forwardOrderFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(forwardOrderSchema)
  .handler(({ context, data }) => forwardOrder(database, context.tenantId, data));
export const updateShipmentFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(shipmentUpdateSchema)
  .handler(({ context, data }) => writeShipmentUpdate(data, { tenantId: context.tenantId }));
export const rotateSupplierLinkFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(({ context, data }) => rotateSupplierLink(database, context.tenantId, data.shipmentId));
/** A cancelled parcel back to its supplier, with a new link. */
export const reforwardShipmentFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(({ context, data }) => reforwardShipment(database, context.tenantId, data.shipmentId));
export const revokeSupplierLinkFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(({ context, data }) => revokeSupplierLink(database, context.tenantId, data.shipmentId));
function privateResponse() {
  setResponseHeader("Cache-Control", "no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}
export const getSupplierShipmentFn = createServerFn({ method: "GET" })
  .validator(z.object({ token: supplierTokenSchema }))
  .handler(({ data }) => {
    privateResponse();
    return getSupplierShipment(database, data.token);
  });
export const updateSupplierShipmentFn = createServerFn({ method: "POST" })
  .validator(z.object({ token: supplierTokenSchema, update: shipmentUpdateSchema }))
  .handler(({ data }) => {
    privateResponse();
    return writeShipmentUpdate(data.update, { token: data.token });
  });
