import {
  MAX_NEW_SUPPLIER_DELIVERIES,
  PAYMENT_PROVIDERS,
} from "@sellbridge/shared/payment-accounts";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  staffMiddleware,
  supplierPanelMiddleware,
  tenantMiddleware,
} from "@/lib/server/middleware";
import { asaasAccountFormSchema } from "./asaas-account-form";
import {
  chooseReceivingProvider,
  loadAsaasReceiving,
  openSupplierAsaasAccount,
  retryAsaasProtection,
} from "./asaas-receiving.server";
import {
  decideHeldPayment,
  loadHeldPaymentDecision,
  loadManualRefund,
  loadNewSupplierRule,
  saveNewSupplierRule,
} from "./held-payment-decision.server";
import { confirmAsaasPaymentReturn } from "./supplier-payments.server";

const supplierInput = z.object({ supplierId: z.uuid() });

export const getAsaasReceivingFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput)
  .handler(async ({ data }) => await loadAsaasReceiving(data.supplierId));

export const openAsaasAccountFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput.extend({ form: z.unknown() }))
  .handler(async ({ data, context }) => {
    // Checked here, with today's date, so the age rule never depends on the browser's clock.
    const form = asaasAccountFormSchema(new Date()).parse(data.form);
    return await openSupplierAsaasAccount({
      supplierId: data.supplierId,
      userId: context.userId,
      actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
      form,
    });
  });

export const retryAsaasProtectionFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput)
  .handler(
    async ({ data, context }) =>
      await retryAsaasProtection({
        supplierId: data.supplierId,
        actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
      }),
  );

export const chooseReceivingProviderFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput.extend({ provider: z.enum(PAYMENT_PROVIDERS) }))
  .handler(
    async ({ data, context }) =>
      await chooseReceivingProvider({
        supplierId: data.supplierId,
        provider: data.provider,
        userId: context.userId,
        actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
      }),
  );

export const confirmAsaasPaymentReturnFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(
    async ({ data, context }) =>
      await confirmAsaasPaymentReturn({ tenantId: context.tenantId, shipmentId: data.shipmentId }),
  );

export const getHeldPaymentDecisionFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(z.object({ shipmentPaymentId: z.uuid() }))
  .handler(async ({ data }) => await loadHeldPaymentDecision(data.shipmentPaymentId));

/** Read-only, for whoever may open the problem it belongs to. */
export const getManualRefundFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("audit.view")])
  .validator(z.object({ shipmentPaymentId: z.uuid() }))
  .handler(async ({ data }) => await loadManualRefund(data.shipmentPaymentId));

export const decideHeldPaymentFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(z.object({ shipmentPaymentId: z.uuid(), decision: z.enum(["release", "refund"]) }))
  .handler(
    async ({ data, context }) =>
      await decideHeldPayment({
        shipmentPaymentId: data.shipmentPaymentId,
        decision: data.decision,
        userId: context.userId,
      }),
  );

export const getNewSupplierRuleFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .handler(async () => await loadNewSupplierRule());

export const saveNewSupplierRuleFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(
    z.object({
      enabled: z.boolean(),
      deliveries: z
        .number()
        .int("Use um número inteiro de entregas.")
        .min(1, "Use pelo menos 1 entrega.")
        .max(MAX_NEW_SUPPLIER_DELIVERIES, `Use no máximo ${MAX_NEW_SUPPLIER_DELIVERIES} entregas.`),
    }),
  )
  .handler(
    async ({ data, context }) =>
      await saveNewSupplierRule({
        enabled: data.enabled,
        deliveries: data.deliveries,
        userId: context.userId,
      }),
  );
