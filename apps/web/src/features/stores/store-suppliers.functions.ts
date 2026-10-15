import {
  changeStoreSupplier,
  findOnboardingProfile,
  findStoreSuppliers,
  listStoreConnections,
  previewStoreSupplierChange,
  type StoreSupplier,
  type StoreSupplierChangeImpact,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { requestStockSync } from "@/lib/server/stock-sync";

export interface StoreSuppliersOverview {
  /** Who each shop sells, by supplier id. */
  suppliers: StoreSupplier[];
  /** The supplier picked during onboarding, which a first shop sells. */
  starterSupplier: StoreSupplier | null;
}

/** The suppliers of the tenant's shops and of its onboarding, for the stores page. */
export const getStoreSuppliers = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<StoreSuppliersOverview> => {
    const [stores, profile] = await Promise.all([
      listStoreConnections(database, context.tenantId),
      findOnboardingProfile(database, context.tenantId),
    ]);
    const starterId = profile.starterSupplier?.id ?? null;
    const ids = stores.flatMap((store) => (store.supplierId === null ? [] : [store.supplierId]));
    const suppliers = await findStoreSuppliers(
      database,
      starterId === null ? ids : [...ids, starterId],
    );
    return {
      suppliers,
      starterSupplier: suppliers.find((supplier) => supplier.id === starterId) ?? null,
    };
  });

const storeSupplierInputSchema = z.object({
  storeConnectionId: z.uuid(),
  supplierId: z.uuid(),
});

/** What moving a shop to another supplier would pause or stop, without changing anything. */
export const previewStoreSupplier = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(storeSupplierInputSchema)
  .handler(async ({ context, data }): Promise<StoreSupplierChangeImpact> =>
    previewStoreSupplierChange(database, { tenantId: context.tenantId, ...data }),
  );

/** Moves a shop to another supplier; the marketplaces get zero stock for the paused listings now. */
export const changeStoreSupplierFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(storeSupplierInputSchema)
  .handler(async ({ context, data }): Promise<StoreSupplierChangeImpact> => {
    const impact = await changeStoreSupplier(database, { tenantId: context.tenantId, ...data });
    logger.info("store.supplier_changed", {
      tenantId: context.tenantId,
      storeConnectionId: data.storeConnectionId,
      supplierId: data.supplierId,
      livePaused: impact.livePaused,
      queuedStopped: impact.queuedStopped,
    });
    if (impact.livePaused > 0) {
      await requestStockSync("store.supplier_sync_deferred");
    }
    return impact;
  });
