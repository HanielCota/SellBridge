import {
  createSupplierBrand,
  getSupplierBrand,
  updateSupplierBrand,
} from "@sellbridge/database/repositories";
import { adminSupplierValuesSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { accountMiddleware } from "@/lib/server/middleware";
import { assertVisitKeepsOrdersEmail } from "@/lib/server/impersonation-rules";
import { assertSupplierProfile } from "@/lib/server/supplier-panel-access";

/**
 * The supplier's own brand ("Sua marca" before it exists, "Dados da marca" after). Same rules as
 * the team's supplier form; the logo and the active switch stay with the team. `loginEmail`
 * fills the orders e-mail of a new brand, so the first order reaches the supplier.
 */
export const getOwnBrandFn = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    assertSupplierProfile(context.profileKind);
    const [brand, loginEmail] = await Promise.all([
      getSupplierBrand(database, context.tenantId),
      loginEmailOf(context.userId),
    ]);
    return { brand, loginEmail };
  });

async function loginEmailOf(userId: string): Promise<string> {
  const account = await database.query.user.findFirst({
    where: (user, { eq }) => eq(user.id, userId),
    columns: { email: true },
  });
  return account?.email ?? "";
}

export const createOwnBrandFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(adminSupplierValuesSchema)
  .handler(async ({ context, data }) => {
    assertSupplierProfile(context.profileKind);
    if (context.impersonatedBy !== null) {
      assertVisitKeepsOrdersEmail({
        impersonatedBy: context.impersonatedBy,
        loginEmail: await loginEmailOf(context.userId),
        ordersEmail: data.contactEmail,
      });
    }
    return createSupplierBrand(database, { organizationId: context.tenantId, values: data });
  });

export const updateOwnBrandFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(adminSupplierValuesSchema)
  .handler(async ({ context, data }) => {
    assertSupplierProfile(context.profileKind);
    return updateSupplierBrand(database, { organizationId: context.tenantId, values: data });
  });
