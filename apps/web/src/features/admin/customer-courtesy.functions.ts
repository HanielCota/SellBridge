import { grantCourtesySchema, revokeCourtesySchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { staffMiddleware } from "@/lib/server/middleware";
import { grantCustomerCourtesy, revokeCustomerCourtesy } from "./customer-courtesy.server";

export const adminGrantCustomerCourtesy = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("billing.grant_courtesy")])
  .validator(grantCourtesySchema)
  .handler(async ({ context, data }) => grantCustomerCourtesy(context.userId, data));

export const adminRevokeCustomerCourtesy = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("billing.grant_courtesy")])
  .validator(revokeCourtesySchema)
  .handler(async ({ context, data }) => revokeCustomerCourtesy(context.userId, data));
