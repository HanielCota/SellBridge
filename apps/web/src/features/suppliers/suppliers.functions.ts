import {
  getCatalogProductForRegion,
  getSupplierForRegion,
  listCatalogProducts,
  listNichesForRegion,
  listSupplierCategories,
  listSuppliersForRegion,
} from "@sellbridge/db/repositories";
import { catalogSearchSchema, supplierListSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { tenantMiddleware } from "@/lib/server/middleware";
import { requireTenantRegion } from "@/lib/server/region";

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(supplierListSearchSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const [suppliers, niches] = await Promise.all([
      listSuppliersForRegion(db, region, { search: data.q, niche: data.niche }),
      listNichesForRegion(db, region),
    ]);
    return { region, suppliers, niches };
  });

const supplierCatalogInputSchema = catalogSearchSchema.extend({ supplierId: z.uuid() });

export const getSupplierCatalog = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(supplierCatalogInputSchema)
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    const supplier = await getSupplierForRegion(db, region, data.supplierId);
    const [products, categories] = await Promise.all([
      listCatalogProducts(
        db,
        supplier.id,
        {
          search: data.q,
          categorySlug: data.category,
          minCostCents: data.minCost,
          maxCostCents: data.maxCost,
          inStockOnly: data.inStock,
          sort: data.sort,
        },
        { page: data.page, pageSize: data.pageSize },
      ),
      listSupplierCategories(db, supplier.id),
    ]);
    return { supplier, products, categories };
  });

export const getCatalogProduct = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ productId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const region = await requireTenantRegion(context.tenantId);
    return getCatalogProductForRegion(db, region, data.productId);
  });
