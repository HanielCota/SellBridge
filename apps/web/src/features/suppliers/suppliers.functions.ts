import {
  getSupplierForRegion,
  listCatalogProducts,
  listNichesForRegion,
  listRecentSupplierReviews,
  listSupplierCategories,
  listSuppliersForRegion,
} from "@sellbridge/database/repositories";
import { compareReputation } from "@sellbridge/shared/supplier-score";
import { catalogSearchSchema, supplierListSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { requireTenantRegion } from "@/features/region/region.server";
import { loadReputations } from "./reputation.server";

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(supplierListSearchSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const [found, niches] = await Promise.all([
      listSuppliersForRegion(database, region, { search: data.query, niche: data.niche }),
      listNichesForRegion(database, region),
    ]);
    const reputationOf = await loadReputations(found.map((supplier) => supplier.id));
    const suppliers = found.map((supplier) => ({
      ...supplier,
      reputation: reputationOf(supplier.id),
    }));
    if (data.sort === "reputation") {
      return {
        region,
        niches,
        suppliers: suppliers.toSorted((first, second) =>
          compareReputation(first.reputation, second.reputation),
        ),
      };
    }
    return { region, suppliers, niches };
  });

/** Score, breakdown and latest written reviews of a supplier that serves the tenant. */
export const getSupplierReputation = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ supplierId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const supplier = await getSupplierForRegion(database, region, data.supplierId);
    const [reputationOf, recentReviews] = await Promise.all([
      loadReputations([supplier.id]),
      listRecentSupplierReviews(database, supplier.id),
    ]);
    return { reputation: reputationOf(supplier.id), recentReviews };
  });

const supplierCatalogInputSchema = catalogSearchSchema.extend({ supplierId: z.uuid() });

export const getSupplierCatalog = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(supplierCatalogInputSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const supplier = await getSupplierForRegion(database, region, data.supplierId);
    const [products, categories] = await Promise.all([
      listCatalogProducts(
        database,
        supplier.id,
        {
          search: data.query,
          categorySlug: data.category,
          minCostCents: data.minCost,
          maxCostCents: data.maxCost,
          inStockOnly: data.inStock,
          sort: data.sort,
        },
        { page: data.page, pageSize: data.pageSize },
      ),
      listSupplierCategories(database, supplier.id),
    ]);
    return { supplier, products, categories };
  });
