import {
  createSupplierBrand,
  getSupplierBrand,
  updateSupplierBrand,
} from "@sellbridge/database/repositories";
import { adminSupplierValuesSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { blockedContactLogging } from "@/lib/server/blocked-contact-logging";
import { database } from "@/lib/server/database";
import { loadProductCategories } from "@/lib/server/reference-data";
import { accountMiddleware } from "@/lib/server/middleware";
import { assertVisitKeepsOrdersEmail } from "@/lib/server/impersonation-rules";
import { assertSupplierProfile } from "@/lib/server/supplier-panel-access";
import { checkSupplierApprovalAfterSave } from "@/features/supplier-approval/approval-check.server";

/**
 * The supplier's own brand ("Sua marca" before it exists, "Dados da marca" after). Same rules as
 * the team's supplier form; the logo and the active switch stay with the team. `account`
 * fills a new brand's name and orders e-mail, so the first order reaches the supplier.
 * `categoryNames` feeds "O que você vende", so niches match the catalog filter.
 */
export const getOwnBrandFn = createServerFn({ method: "GET" })
  .middleware([accountMiddleware])
  .handler(async ({ context }) => {
    assertSupplierProfile(context.profileKind);
    const [brand, account, categories] = await Promise.all([
      getSupplierBrand(database, context.tenantId),
      accountOf(context.userId),
      loadProductCategories(),
    ]);
    // Unique names: the list keys its options by name, and test runs can leave twins behind.
    const categoryNames = [...new Set(categories.map((category) => category.name))];
    return { brand, account, categoryNames };
  });

async function accountOf(userId: string): Promise<{ email: string; name: string }> {
  const account = await database.query.user.findFirst({
    where: (user, { eq }) => eq(user.id, userId),
    columns: { email: true, name: true },
  });
  return { email: account?.email ?? "", name: account?.name ?? "" };
}

export const createOwnBrandFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware, blockedContactLogging("supplier_panel")])
  .validator(adminSupplierValuesSchema)
  .handler(async ({ context, data }) => {
    assertSupplierProfile(context.profileKind);
    if (context.impersonatedBy !== null) {
      assertVisitKeepsOrdersEmail({
        impersonatedBy: context.impersonatedBy,
        loginEmail: (await accountOf(context.userId)).email,
        ordersEmail: data.contactEmail,
      });
    }
    const brand = await createSupplierBrand(database, {
      organizationId: context.tenantId,
      values: data,
    });
    await checkSupplierApprovalAfterSave(brand.id);
    return brand;
  });

export const updateOwnBrandFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware, blockedContactLogging("supplier_panel")])
  .validator(adminSupplierValuesSchema)
  .handler(async ({ context, data }) => {
    assertSupplierProfile(context.profileKind);
    const brand = await updateSupplierBrand(database, {
      organizationId: context.tenantId,
      values: data,
    });
    await checkSupplierApprovalAfterSave(brand.id);
    return brand;
  });
