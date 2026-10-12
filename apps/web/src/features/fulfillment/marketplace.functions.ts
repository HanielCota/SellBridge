import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { loadMarketplaceShipping } from "./marketplace.server";
import { applyMarketplaceShipment } from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
const schema = z.object({ orderId: z.uuid() });
export const getMarketplaceShippingFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(schema)
  .handler(({ context, data }) => loadMarketplaceShipping(context.tenantId, data.orderId));
export const refreshMarketplaceTrackingFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(schema)
  .handler(async ({ context, data }) => {
    const shipping = await loadMarketplaceShipping(context.tenantId, data.orderId);
    await applyMarketplaceShipment(database, context.tenantId, data.orderId, shipping);
    return { ok: true };
  });
