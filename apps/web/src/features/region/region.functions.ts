import {
  countListingsOutsideRegion,
  findTenantRegion,
  listSuppliersForRegion,
  saveTenantRegion,
  type SupplierSummary,
  type TenantRegion,
} from "@sellbridge/database/repositories";
import type { ResolvedAddress } from "@sellbridge/shared/cep";
import { logger } from "@sellbridge/shared/logger";
import { updateRegionSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { compareSupplierCoverage, type CoverageChange } from "@/features/region/coverage-change";
import { resolveCep } from "@/features/region/region.server";

export const getTenantRegion = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<TenantRegion | null> => {
    return findTenantRegion(database, context.tenantId);
  });

export interface RegionOverview {
  region: TenantRegion | null;
  suppliers: SupplierSummary[];
}

/** The tenant's region and the suppliers that deliver there. */
export const getRegionOverview = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<RegionOverview> => {
    const region = await findTenantRegion(database, context.tenantId);
    if (!region) {
      return { region: null, suppliers: [] };
    }
    return { region, suppliers: await listSuppliersForRegion(database, region, {}) };
  });

export interface RegionPreview extends CoverageChange {
  address: ResolvedAddress;
  /** Same city and state as today: the catalog does not change. */
  isCurrentRegion: boolean;
  /** Listings whose supplier does not deliver to the new region. */
  affectedListings: number;
}

/** What saving this CEP would do, without saving it. */
export const previewRegionChange = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(updateRegionSchema)
  .handler(async ({ context, data }): Promise<RegionPreview> => {
    const address = await resolveCep(data.cep);
    const current = await findTenantRegion(database, context.tenantId);
    const [currentSuppliers, nextSuppliers, affectedListings] = await Promise.all([
      current ? listSuppliersForRegion(database, current, {}) : Promise.resolve([]),
      listSuppliersForRegion(database, address, {}),
      countListingsOutsideRegion(database, context.tenantId, address),
    ]);
    const isCurrentRegion =
      current !== null &&
      current.state === address.state &&
      current.city.toLowerCase() === address.city.toLowerCase();
    return {
      ...compareSupplierCoverage(currentSuppliers, nextSuppliers),
      address,
      isCurrentRegion,
      affectedListings,
    };
  });

export const updateTenantRegion = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(updateRegionSchema)
  .handler(async ({ context, data }): Promise<TenantRegion> => {
    const address = await resolveCep(data.cep);
    const region = await saveTenantRegion(database, context.tenantId, address);
    logger.info("region.updated", { tenantId: context.tenantId, state: region.state });
    return region;
  });
