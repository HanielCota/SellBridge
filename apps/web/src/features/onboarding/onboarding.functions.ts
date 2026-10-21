import {
  findOnboardingProfile,
  saveBillingHolder,
  saveStarterSupplier,
  saveProductSourceChoice,
  type BillingHolder,
  type OnboardingProfile,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { productSourceChoiceSchema } from "@sellbridge/shared/product-sources";
import { billingHolderSchema, starterSupplierSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";

/** Who invoices go to and the supplier picked for the first shop, as onboarding left them. */
export const getOnboardingProfile = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<OnboardingProfile> =>
    findOnboardingProfile(database, context.tenantId),
  );

/** First step: a CPF already used by another account is refused with a conflict. */
export const saveOnboardingHolder = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(billingHolderSchema)
  .handler(async ({ context, data }): Promise<BillingHolder> => {
    const holder = await saveBillingHolder(database, context.tenantId, data);
    logger.info("onboarding.holder_saved", { tenantId: context.tenantId });
    return holder;
  });

/** Second step: the supplier the first shop sells, from anywhere in Brazil. */
export const saveOnboardingSupplier = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(starterSupplierSchema)
  .handler(async ({ context, data }): Promise<void> => {
    await saveStarterSupplier(database, context.tenantId, data.supplierId);
    logger.info("onboarding.supplier_saved", {
      tenantId: context.tenantId,
      supplierId: data.supplierId,
    });
  });

export const saveOnboardingProductSources = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(productSourceChoiceSchema)
  .handler(async ({ context, data }): Promise<void> => {
    await saveProductSourceChoice(database, context.tenantId, data);
    logger.info("onboarding.product_sources_saved", {
      tenantId: context.tenantId,
      mode: data.mode,
    });
  });
