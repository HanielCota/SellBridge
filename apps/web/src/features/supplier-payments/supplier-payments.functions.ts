import { SUPPLIER_PAY_METHODS } from "@sellbridge/shared/shipment-payments";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware, tenantMiddleware } from "@/lib/server/middleware";
import {
  confirmSupplierPaymentReturn,
  loadPaymentAccount,
  loadResellerSupplierPayment,
  startSupplierCheckout,
  unlinkPaymentAccount,
} from "./supplier-payments.server";

const supplierInput = z.object({ supplierId: z.uuid() });
const shipmentInput = z.object({ shipmentId: z.uuid() });

export const getPaymentAccountFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput)
  .handler(async ({ data }) => await loadPaymentAccount(data.supplierId));

export const unlinkPaymentAccountFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierInput)
  .handler(
    async ({ data, context }) =>
      await unlinkPaymentAccount({
        supplierId: data.supplierId,
        actor: { viewerKind: context.viewer.kind, impersonatedBy: context.impersonatedBy },
      }),
  );

export const getResellerSupplierPaymentFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(shipmentInput)
  .handler(
    async ({ data, context }) =>
      await loadResellerSupplierPayment({
        tenantId: context.tenantId,
        shipmentId: data.shipmentId,
      }),
  );

export const startSupplierCheckoutFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(shipmentInput.extend({ payMethod: z.enum(SUPPLIER_PAY_METHODS) }))
  .handler(
    async ({ data, context }) =>
      await startSupplierCheckout({
        tenantId: context.tenantId,
        shipmentId: data.shipmentId,
        payMethod: data.payMethod,
        impersonatedBy: context.impersonatedBy,
      }),
  );

export const confirmSupplierPaymentReturnFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(
    shipmentInput.extend({
      providerPaymentId: z.string().regex(/^\d{1,30}$/, "Pagamento inválido"),
    }),
  )
  .handler(
    async ({ data, context }) =>
      await confirmSupplierPaymentReturn({
        tenantId: context.tenantId,
        shipmentId: data.shipmentId,
        providerPaymentId: data.providerPaymentId,
      }),
  );
