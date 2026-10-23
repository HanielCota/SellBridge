import {
  getDirectorySupplier,
  listActiveNiches,
  listCatalogProducts,
  listSupplierCategories,
  listSupplierDirectory,
  listStoreConnections,
  listSupplierLocations,
} from "@sellbridge/database/repositories";
import { compareReputation } from "@sellbridge/shared/supplier-score";
import { catalogSearchSchema, supplierListSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { loadReputations, loadSupplierReputation } from "./reputation.server";
import { canPublishSupplier } from "./supplier-publish-access";

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(supplierListSearchSchema)
  .handler(async ({ data }) => {
    // Every active supplier in Brazil: any reseller sells any of them.
    const [found, niches, locations] = await Promise.all([
      listSupplierDirectory(database, {
        search: data.query,
        niche: data.niche,
        state: data.state,
        city: data.city,
      }),
      listActiveNiches(database),
      listSupplierLocations(database),
    ]);
    const reputationOf = await loadReputations(found.map((supplier) => supplier.id));
    const suppliers = found.map((supplier) => ({
      ...supplier,
      reputation: reputationOf(supplier.id),
    }));
    if (data.sort === "reputation") {
      return {
        niches,
        locations,
        suppliers: suppliers.toSorted((first, second) =>
          compareReputation(first.reputation, second.reputation),
        ),
      };
    }
    return { suppliers, niches, locations };
  });

/** Score and breakdown of any active supplier; review comments never leave the server here. */
export const getSupplierReputation = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ supplierId: z.uuid() }))
  .handler(async ({ data }) => await loadSupplierReputation(data.supplierId));

const supplierCatalogInputSchema = catalogSearchSchema.extend({ supplierId: z.uuid() });

export const getSupplierCatalog = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(supplierCatalogInputSchema)
  .handler(async ({ context, data }) => {
    const supplier = await getDirectorySupplier(database, data.supplierId);
    const [products, categories, stores] = await Promise.all([
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
      listStoreConnections(database, context.tenantId),
    ]);
    // The directory stays open (coordinator decision, function 1); publishing needs a store of it.
    return { supplier, products, categories, canPublish: canPublishSupplier(stores, supplier.id) };
  });
