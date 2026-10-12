import { billingWriteMiddleware } from "./billing-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { billingSummary, openBillingPortal, startSubscription } from "./billing.server";

export const getBilling = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => billingSummary(context.tenantId, context.userId));
export const checkoutBilling = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .validator(z.object({ plan: z.enum(["pro", "business"]) }))
  .handler(async ({ context, data }) => startSubscription({ ...context, plan: data.plan }));
export const manageBilling = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .handler(async ({ context }) => openBillingPortal(context.tenantId, context.userId));
