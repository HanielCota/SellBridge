import {
  addStoreSupplier,
  findOnboardingProfile,
  findStoreSuppliersVisibleTo,
  listStoreConnections,
  previewStoreSupplierRemoval,
  removeStoreSupplier,
  type StoreSupplier,
  type StoreSupplierChangeImpact,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import type { ProductSourceMode } from "@sellbridge/shared/product-sources";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { requestStockSync } from "@/lib/server/stock-sync";

export interface StoreSuppliersOverview {
  productSourceMode: ProductSourceMode | null;
  /** Who each shop sells, by supplier id. */
  suppliers: StoreSupplier[];
  /** The supplier picked during onboarding, which a first shop sells. */
  starterSupplier: StoreSupplier | null;
  /** An active supplier the seller came to sell ("Vender este fornecedor"), when asked for. */
  pickedSupplier: StoreSupplier | null;
}

/** The suppliers of the tenant's shops and of its onboarding, for the stores page. */
export const getStoreSuppliers = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ pickedSupplierId: z.uuid().optional() }))
  .handler(async ({ context, data }): Promise<StoreSuppliersOverview> => {
    const [stores, profile] = await Promise.all([
      listStoreConnections(database, context.tenantId),
      findOnboardingProfile(database, context.tenantId),
    ]);
    const starterId = profile.starterSupplier?.id ?? null;
    const ids = stores.flatMap((store) => store.supplierIds);
    const picked = data.pickedSupplierId;
    const extra = [starterId, picked].flatMap((id) =>
      id === null || id === undefined ? [] : [id],
    );
    const suppliers = await findStoreSuppliersVisibleTo(database, context.tenantId, [
      ...ids,
      ...extra,
    ]);
    return {
      productSourceMode: profile.productSourceMode,
      suppliers,
      starterSupplier: suppliers.find((supplier) => supplier.id === starterId) ?? null,
      pickedSupplier:
        suppliers.find((supplier) => supplier.id === picked && supplier.active) ?? null,
    };
  });

const storeSupplierInputSchema = z.object({
  storeConnectionId: z.uuid(),
  supplierId: z.uuid(),
});

/** Adds a supplier to the ones a shop sells; nothing it publishes today changes. */
export const addStoreSupplierFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(storeSupplierInputSchema)
  .handler(async ({ context, data }): Promise<void> => {
    await addStoreSupplier(database, { tenantId: context.tenantId, ...data });
    logger.info("store.supplier_added", {
      tenantId: context.tenantId,
      storeConnectionId: data.storeConnectionId,
      supplierId: data.supplierId,
    });
  });

/** What removing a supplier from a shop would pause or stop, without changing anything. */
export const previewStoreSupplierRemovalFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(storeSupplierInputSchema)
  .handler(async ({ context, data }): Promise<StoreSupplierChangeImpact> =>
    previewStoreSupplierRemoval(database, { tenantId: context.tenantId, ...data }),
  );

/** Removes a supplier from a shop; the marketplaces get zero stock for its paused listings now. */
export const removeStoreSupplierFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(storeSupplierInputSchema)
  .handler(async ({ context, data }): Promise<StoreSupplierChangeImpact> => {
    const impact = await removeStoreSupplier(database, { tenantId: context.tenantId, ...data });
    logger.info("store.supplier_removed", {
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
