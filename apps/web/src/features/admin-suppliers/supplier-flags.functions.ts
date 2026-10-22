import {
  applySupplierFlagSchema,
  revokeSupplierFlagSchema,
  supplierFlagsInputSchema,
} from "@sellbridge/shared/supplier-flags";
import { createServerFn } from "@tanstack/react-start";
import { staffMiddleware } from "@/lib/server/middleware";
import { applyFlag, loadTeamSupplierFlags, revokeFlag } from "./supplier-flags.server";

/** Every team member reads a supplier's flags; only admins and supervisors change them. */
export const teamListSupplierFlags = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("suppliers.view_flags")])
  .validator(supplierFlagsInputSchema)
  .handler(async ({ context, data }) => await loadTeamSupplierFlags(context, data.supplierId));

export const teamApplySupplierFlag = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("suppliers.flag")])
  .validator(applySupplierFlagSchema)
  .handler(async ({ context, data }) => await applyFlag(context, data));

export const teamRevokeSupplierFlag = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("suppliers.flag")])
  .validator(revokeSupplierFlagSchema)
  .handler(async ({ context, data }) => await revokeFlag(context, data));
