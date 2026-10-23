import { findSupplierAccountUserId } from "@sellbridge/database/repositories";
import { adminSupplierIdSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { adminMiddleware } from "@/lib/server/middleware";

/**
 * Who to enter as for "Entrar como fornecedor" on the admin's supplier list. Read on click, so
 * the list never carries account ids; the visit itself is checked again by the auth hook.
 */
export const findSupplierAccountFn = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminSupplierIdSchema)
  .handler(async ({ data }) => ({
    userId: await findSupplierAccountUserId(database, data.supplierId),
  }));
