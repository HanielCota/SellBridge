import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { trackingQuerySchema } from "./carrier-tracking";
import { orderTracking, parcelsInTransit, searchTracking } from "./order-tracking.server";

// POST: a tracking code typed by the reseller stays out of the request URL and access logs.
export const searchTrackingFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(trackingQuerySchema)
  .handler(({ context, data }) => searchTracking(context.tenantId, data.query));

export const orderTrackingFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ orderId: z.uuid() }))
  .handler(({ context, data }) => orderTracking(context.tenantId, data.orderId));

export const parcelsInTransitFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(({ context }) => parcelsInTransit(context.tenantId));
