import { billingWriteMiddleware } from "./billing-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import {
  billingSummary,
  findBillingNotice,
  openBillingPortal,
  startSubscription,
} from "./billing.server";

export const getBilling = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => billingSummary(context.tenantId, context.userId));
export const checkoutBilling = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  // Every paid plan of both catalogs; priceId refuses one the catalog in force does not sell.
  .validator(z.object({ plan: z.enum(["start", "pro", "business", "black", "elite"]) }))
  .handler(async ({ context, data }) => startSubscription({ ...context, plan: data.plan }));
export const manageBilling = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .handler(async ({ context }) => openBillingPortal(context.tenantId, context.userId));
/** A payment the reseller must fix, for the dashboard; null when the subscription is fine. */
export const getBillingNotice = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => findBillingNotice(context.tenantId));
