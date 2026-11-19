import { createServerFn } from "@tanstack/react-start";
import { BILLING_PLAN_IDS } from "@sellbridge/shared/billing";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { billingWriteMiddleware } from "./billing-middleware";
import { billingSummary, findBillingNotice } from "./billing.server";
import {
  cancelSubscription,
  changePaymentMethod,
  changePlan,
  openPendingPayment,
  quotePlanChange,
  startSubscription,
} from "./subscription-actions.server";

const planSchema = z.object({ plan: z.enum(BILLING_PLAN_IDS) });
const methodSchema = z.enum(["pix", "credit_card"]);

export const getBilling = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => billingSummary(context.tenantId, context.userId));

export const subscribeBilling = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .validator(planSchema.extend({ method: methodSchema }))
  .handler(async ({ context, data }) =>
    startSubscription({ ...context, plan: data.plan, method: data.method }),
  );

export const quoteBillingPlan = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(planSchema)
  .handler(async ({ context, data }) => quotePlanChange({ ...context, plan: data.plan }));

export const changeBillingPlan = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .validator(planSchema)
  .handler(async ({ context, data }) => changePlan({ ...context, plan: data.plan }));

export const openBillingPayment = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .handler(async ({ context }) => openPendingPayment(context));

export const changeBillingPaymentMethod = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .validator(z.object({ method: methodSchema }))
  .handler(async ({ context, data }) => changePaymentMethod({ ...context, method: data.method }));

export const cancelBilling = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware, billingWriteMiddleware])
  .handler(async ({ context }) => cancelSubscription(context));

/** A payment the reseller must fix, for the dashboard; null when the subscription is fine. */
export const getBillingNotice = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => findBillingNotice(context.tenantId));
