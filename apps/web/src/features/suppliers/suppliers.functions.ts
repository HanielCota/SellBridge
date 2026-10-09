import {
  getSupplierForRegion,
  listCatalogProducts,
  listNichesForRegion,
  listSupplierCategories,
  listSuppliersForRegion,
} from "@sellbridge/database/repositories";
import { catalogSearchSchema, supplierListSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { requireTenantRegion } from "@/features/region/region.server";

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(supplierListSearchSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const [suppliers, niches] = await Promise.all([
      listSuppliersForRegion(database, region, { search: data.query, niche: data.niche }),
      listNichesForRegion(database, region),
    ]);
    return { region, suppliers, niches };
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
