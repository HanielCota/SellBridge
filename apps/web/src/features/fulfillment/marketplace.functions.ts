import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { loadMarketplaceShipping } from "./marketplace.server";
import { refreshMarketplaceShipment } from "./shipments.server";
const schema = z.object({ orderId: z.uuid() });
export const getMarketplaceShippingFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(schema)
  .handler(({ context, data }) => loadMarketplaceShipping(context.tenantId, data.orderId));
export const refreshMarketplaceTrackingFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(schema)
  .handler(async ({ context, data }) => {
    await refreshMarketplaceShipment(context.tenantId, data.orderId);
    return { ok: true };
  });
