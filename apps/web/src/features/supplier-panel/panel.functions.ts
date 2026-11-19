import { findSupplierOfProfile, getSupplierApprovalState } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { accountMiddleware } from "@/lib/server/middleware";
import { assertSupplierProfile } from "@/lib/server/supplier-panel-access";

/**
 * The catalog the tab's supplier profile runs, or null while it has not set up its brand, with
 * where its approval stands. Every panel page reads its `supplierId` from here, never from the
 * address.
 */
export const getOwnSupplierFn = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    assertSupplierProfile(context.profileKind);
    const supplier = await findSupplierOfProfile(database, context.tenantId);
    const approval =
      supplier === null ? null : await getSupplierApprovalState(database, supplier.id);
    return { supplier, approval };
  });
