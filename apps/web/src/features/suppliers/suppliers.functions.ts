import {
  getDirectorySupplier,
  listActiveNiches,
  listCatalogProducts,
  listRecentSupplierReviews,
  listSupplierCategories,
  listSupplierDirectory,
} from "@sellbridge/database/repositories";
import { compareReputation } from "@sellbridge/shared/supplier-score";
import { catalogSearchSchema, supplierListSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { loadReputations } from "./reputation.server";

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(supplierListSearchSchema)
  .handler(async ({ data }) => {
    // Every active supplier in Brazil: any reseller sells any of them.
    const [found, niches] = await Promise.all([
      listSupplierDirectory(database, { search: data.query, niche: data.niche }),
      listActiveNiches(database),
    ]);
    const reputationOf = await loadReputations(found.map((supplier) => supplier.id));
    const suppliers = found.map((supplier) => ({
      ...supplier,
      reputation: reputationOf(supplier.id),
    }));
    if (data.sort === "reputation") {
      return {
        niches,
        suppliers: suppliers.toSorted((first, second) =>
          compareReputation(first.reputation, second.reputation),
        ),
      };
    }
    return { suppliers, niches };
  });

/** Score, breakdown and latest written reviews of any active supplier. */
export const getSupplierReputation = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ supplierId: z.uuid() }))
  .handler(async ({ data }) => {
    const supplier = await getDirectorySupplier(database, data.supplierId);
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
  .handler(async ({ data }) => {
    const supplier = await getDirectorySupplier(database, data.supplierId);
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
