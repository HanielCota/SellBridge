import { findSupplierOfProfile } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { accountMiddleware } from "@/lib/server/middleware";
import { assertSupplierProfile } from "@/lib/server/supplier-panel-access";

/**
 * The catalog the session's supplier profile runs, or null while it has not set up its brand.
 * Every panel page reads its `supplierId` from here, never from the address.
 */
export const getOwnSupplierFn = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    assertSupplierProfile(context.profileKind);
    return { supplier: await findSupplierOfProfile(database, context.tenantId) };
  });
