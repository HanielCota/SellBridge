import { supplierTokenSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { publicMiddleware, tenantMiddleware } from "@/lib/server/middleware";
import { privateResponse } from "@/lib/server/private-response";
import { issueBuyerTrackingLink, loadBuyerTracking } from "./buyer-tracking.server";

export const issueBuyerTrackingLinkFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(
    async ({ context, data }) =>
      await issueBuyerTrackingLink({
        tenantId: context.tenantId,
        shipmentId: data.shipmentId,
        requestUrl: getRequest().url,
      }),
  );

// POST: a GET would put the link's token in the request URL (history, proxies, access logs).
// The buyer token has the supplier token's shape (64 hex), so it reuses that schema.
export const getBuyerTrackingFn = createServerFn({ method: "POST" })
  .middleware([publicMiddleware])
  .validator(z.object({ token: supplierTokenSchema }))
  .handler(async ({ data }) => {
    privateResponse();
    return await loadBuyerTracking(data.token);
  });
