import { listOrderClaims, listSupplierParcelClaims } from "@sellbridge/database/repositories";
import { supplierShipmentDetailSchema } from "@sellbridge/shared/supplier-panel-orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { supplierPanelMiddleware, tenantMiddleware } from "@/lib/server/middleware";

/** The buyer's claims on one order of the tenant; none for another tenant's order. */
export const listOrderClaimsFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ orderId: z.uuid() }))
  .handler(
    async ({ context, data }) =>
      await listOrderClaims(database, { tenantId: context.tenantId, orderId: data.orderId }),
  );

/** The claims on the order of one of the supplier's parcels, without the reseller's money. */
export const listSupplierParcelClaimsFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(supplierShipmentDetailSchema)
  .handler(async ({ data }) => {
    const claims = await listSupplierParcelClaims(database, data);
    return claims.map((claim) => ({ ...claim, moneyStatus: null }));
  });
