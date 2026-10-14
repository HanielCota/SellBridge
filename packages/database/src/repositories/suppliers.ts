import { notFoundError } from "@sellbridge/shared/errors";
import {
  toPaginated,
  type Paginated,
  type Pagination,
  type ProductSort,
} from "@sellbridge/shared/schemas";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../client.ts";
import { containsPattern, matchesEveryWord } from "./sql/search-pattern.ts";
import { categories, listings, supplierProducts, suppliers } from "../schema/index.ts";
import type { TenantRegion } from "./region.ts";
import { availableStock } from "./sql/available-stock.ts";
import { coversRegion } from "./sql/supplier-coverage.ts";

export interface SupplierSummary {
  id: string;
  name: string;
  niche: string;
  description: string;
  state: string;
  city: string;
  logoUrl: string | null;
  productCount: number;
}

export interface ListSuppliersFilters {
  search?: string | undefined;
  niche?: string | undefined;
}

export async function listSuppliersForRegion(
  database: Database,
  region: Pick<TenantRegion, "state" | "city">,
  filters: ListSuppliersFilters,
): Promise<SupplierSummary[]> {
  const conditions: SQL[] = [eq(suppliers.active, true), coversRegion(region)];
  if (filters.niche) {
    conditions.push(eq(suppliers.niche, filters.niche));
  }
  if (filters.search) {
    conditions.push(ilike(suppliers.name, containsPattern(filters.search)));
  }
  const productCount = sql<number>`(select count(*) from ${supplierProducts} where ${and(
    eq(supplierProducts.supplierId, suppliers.id),
    eq(supplierProducts.active, true),
  )})`.mapWith(Number);

  return database
    .select({
      id: suppliers.id,
      name: suppliers.name,
      niche: suppliers.niche,
      description: suppliers.description,
      state: suppliers.state,
      city: suppliers.city,
      logoUrl: suppliers.logoUrl,
      productCount,
    })
    .from(suppliers)
    .where(and(...conditions))
    .orderBy(asc(suppliers.name));
}

export async function listNichesForRegion(
  database: Database,
  region: Pick<TenantRegion, "state" | "city">,
): Promise<string[]> {
  const rows = await database
    .selectDistinct({ niche: suppliers.niche })
    .from(suppliers)
    .where(and(eq(suppliers.active, true), coversRegion(region)))
    .orderBy(asc(suppliers.niche));
  return rows.map((row) => row.niche);
}

/** Loads a supplier only if it serves the tenant's region; otherwise reports not found. */
export async function getSupplierForRegion(
  database: Database,
  region: Pick<TenantRegion, "state" | "city">,
  supplierId: string,
): Promise<SupplierSummary> {
  const [supplier] = await database
    .select({
      id: suppliers.id,
      name: suppliers.name,
      niche: suppliers.niche,
      description: suppliers.description,
      state: suppliers.state,
      city: suppliers.city,
      logoUrl: suppliers.logoUrl,
      productCount: sql<number>`0`.mapWith(Number),
    })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.active, true), coversRegion(region)))
    .limit(1);
  if (!supplier) {
    throw notFoundError("Fornecedor não encontrado na sua região");
  }
  return supplier;
}

/** Margin left by the suggested price; the marketplace fee is a flat rate, so it keeps the order. */
const suggestedMargin = sql`(${supplierProducts.suggestedPriceCents} - ${supplierProducts.costCents})::float / nullif(${supplierProducts.suggestedPriceCents}, 0)`;

/** The id breaks ties last, so equal titles or dates never repeat or skip items across pages. */
const PRODUCT_ORDER: Record<ProductSort, SQL[]> = {
  title: [asc(supplierProducts.title), asc(supplierProducts.id)],
  cost_asc: [
    asc(supplierProducts.costCents),
    asc(supplierProducts.title),
    asc(supplierProducts.id),
  ],
  cost_desc: [
    desc(supplierProducts.costCents),
    asc(supplierProducts.title),
    asc(supplierProducts.id),
  ],
  margin_desc: [sql`${suggestedMargin} desc nulls last`, asc(supplierProducts.id)],
  stock_desc: [desc(availableStock), asc(supplierProducts.title), asc(supplierProducts.id)],
  newest: [desc(supplierProducts.createdAt), asc(supplierProducts.id)],
};

export interface CatalogFilters {
  search?: string | undefined;
  categorySlug?: string | undefined;
  minCostCents?: number | undefined;
  maxCostCents?: number | undefined;
  inStockOnly?: boolean | undefined;
  sort: ProductSort;
}

export interface CatalogProduct {
  id: string;
  sku: string;
  title: string;
  description: string;
  costCents: number;
  suggestedPriceCents: number;
  stock: number;
  /** Last admin change of the product (its shelf count included); sales do not move it. */
  stockUpdatedAt: Date;
  imageUrl: string | null;
  categoryName: string | null;
  categorySlug: string | null;
}

function catalogConditions(supplierId: string, filters: CatalogFilters): SQL[] {
  const conditions: SQL[] = [
    eq(supplierProducts.supplierId, supplierId),
    eq(supplierProducts.active, true),
  ];
  conditions.push(
    exists(
      sql`(select 1 from ${suppliers} where ${and(eq(suppliers.id, supplierProducts.supplierId), eq(suppliers.active, true))})`,
    ),
  );
  if (filters.search) {
    const searchCondition = matchesEveryWord(filters.search, [
      supplierProducts.title,
      supplierProducts.sku,
    ]);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  if (filters.categorySlug) {
    conditions.push(eq(categories.slug, filters.categorySlug));
  }
  if (filters.minCostCents !== undefined) {
    conditions.push(gte(supplierProducts.costCents, filters.minCostCents));
  }
  if (filters.maxCostCents !== undefined) {
    conditions.push(lte(supplierProducts.costCents, filters.maxCostCents));
  }
  if (filters.inStockOnly) {
    conditions.push(gte(availableStock, 1));
  }
  return conditions;
}

export async function listCatalogProducts(
  database: Database,
  supplierId: string,
  filters: CatalogFilters,
  pagination: Pagination,
): Promise<Paginated<CatalogProduct>> {
  const where = and(...catalogConditions(supplierId, filters));
  // The count and the page are independent reads: run them together.
  const [[totalRow], rows] = await Promise.all([
    database
      .select({ total: count() })
      .from(supplierProducts)
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(where),
    database
      .select({
        id: supplierProducts.id,
        sku: supplierProducts.sku,
        title: supplierProducts.title,
        description: supplierProducts.description,
        costCents: supplierProducts.costCents,
        suggestedPriceCents: supplierProducts.suggestedPriceCents,
        stock: availableStock,
        stockUpdatedAt: supplierProducts.updatedAt,
        imageUrls: supplierProducts.imageUrls,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(supplierProducts)
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(where)
      .orderBy(...PRODUCT_ORDER[filters.sort])
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
  ]);

  const items = rows.map(({ imageUrls, ...row }) => ({
    ...row,
    imageUrl: imageUrls.at(0) ?? null,
  }));
  return toPaginated(items, totalRow?.total ?? 0, pagination);
}

export async function listSupplierCategories(
  database: Database,
  supplierId: string,
): Promise<{ name: string; slug: string }[]> {
  return database
    .selectDistinct({ name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(supplierProducts, eq(supplierProducts.categoryId, categories.id))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.active, true),
        eq(suppliers.active, true),
      ),
    )
    .orderBy(asc(categories.name));
}

/** Product detail, only when its supplier serves the tenant's region. */
export async function getCatalogProductForRegion(
  database: Database,
  region: Pick<TenantRegion, "state" | "city">,
  productId: string,
): Promise<CatalogProduct & { supplierId: string; supplierName: string; imageUrls: string[] }> {
  const [row] = await database
    .select({
      id: supplierProducts.id,
      sku: supplierProducts.sku,
      title: supplierProducts.title,
      description: supplierProducts.description,
      costCents: supplierProducts.costCents,
      suggestedPriceCents: supplierProducts.suggestedPriceCents,
      stock: availableStock,
      stockUpdatedAt: supplierProducts.updatedAt,
      imageUrls: supplierProducts.imageUrls,
      categoryName: categories.name,
      categorySlug: categories.slug,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
    })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
    .where(
      and(
        eq(supplierProducts.id, productId),
        eq(supplierProducts.active, true),
        eq(suppliers.active, true),
        coversRegion(region),
      ),
    )
    .limit(1);
  if (!row) {
    throw notFoundError("Produto não encontrado na sua região");
  }
  return { ...row, imageUrl: row.imageUrls.at(0) ?? null };
}

export async function getSupplierIdsForRegion(
  database: Database,
  region: Pick<TenantRegion, "state" | "city">,
): Promise<string[]> {
  const rows = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.active, true), coversRegion(region)));
  return rows.map((row) => row.id);
}

/**
 * Listings of the tenant whose supplier does not serve the given region: after moving there,
 * their products no longer show in the catalog.
 */
export async function countListingsOutsideRegion(
  database: Database,
  tenantId: string,
  region: Pick<TenantRegion, "state" | "city">,
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(and(eq(listings.tenantId, tenantId), sql`not ${coversRegion(region)}`));
  return row?.total ?? 0;
}

export interface RegionCatalogFilters {
  search?: string | undefined;
  categorySlug?: string | undefined;
  supplierId?: string | undefined;
  inStockOnly?: boolean | undefined;
  unpublishedOnly?: boolean | undefined;
  sort: ProductSort;
}

export interface RegionCatalogProduct extends CatalogProduct {
  supplierId: string;
  supplierName: string;
  /** Every picture of the product, the first one being `imageUrl`. */
  imageUrls: string[];
  /** The tenant already has a listing for this product. */
  published: boolean;
}

function isPublishedBy(tenantId: string): SQL {
  return sql`exists (select 1 from ${listings} where ${listings.tenantId} = ${tenantId} and ${listings.supplierProductId} = ${supplierProducts.id})`;
}

function regionCatalogConditions(
  input: { region: Pick<TenantRegion, "state" | "city">; tenantId: string },
  filters: RegionCatalogFilters,
): SQL[] {
  const { region } = input;
  const conditions: SQL[] = [
    eq(supplierProducts.active, true),
    eq(suppliers.active, true),
    coversRegion(region),
  ];
  if (filters.search) {
    const searchCondition = matchesEveryWord(filters.search, [
      supplierProducts.title,
      supplierProducts.sku,
      suppliers.name,
    ]);
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  if (filters.categorySlug) {
    conditions.push(eq(categories.slug, filters.categorySlug));
  }
  if (filters.supplierId) {
    conditions.push(eq(suppliers.id, filters.supplierId));
  }
  if (filters.inStockOnly) {
    conditions.push(gte(availableStock, 1));
  }
  if (filters.unpublishedOnly) {
    conditions.push(sql`not ${isPublishedBy(input.tenantId)}`);
  }
  return conditions;
}

function selectRegionCatalog(database: Database, tenantId: string) {
  return database
    .select({
      id: supplierProducts.id,
      sku: supplierProducts.sku,
      title: supplierProducts.title,
      description: supplierProducts.description,
      costCents: supplierProducts.costCents,
      suggestedPriceCents: supplierProducts.suggestedPriceCents,
      stock: availableStock,
      stockUpdatedAt: supplierProducts.updatedAt,
      imageUrls: supplierProducts.imageUrls,
      categoryName: categories.name,
      categorySlug: categories.slug,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      published: sql<boolean>`${isPublishedBy(tenantId)}`,
    })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(categories, eq(categories.id, supplierProducts.categoryId));
}

/** Every product from suppliers that deliver to the tenant's region, in one list. */
export async function listRegionCatalog(
  database: Database,
  input: { region: Pick<TenantRegion, "state" | "city">; tenantId: string },
  filters: RegionCatalogFilters,
  pagination: Pagination,
): Promise<Paginated<RegionCatalogProduct>> {
  const where = and(...regionCatalogConditions(input, filters));
  // The count and the page are independent reads: run them together.
  const [[totalRow], rows] = await Promise.all([
    database
      .select({ total: count() })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(where),
    selectRegionCatalog(database, input.tenantId)
      .where(where)
      .orderBy(...PRODUCT_ORDER[filters.sort])
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
  ]);
  const items = rows.map((row) => ({ ...row, imageUrl: row.imageUrls.at(0) ?? null }));
  return toPaginated(items, totalRow?.total ?? 0, pagination);
}

/** Categories with at least one product available in the region. */
export async function listRegionCategories(
  database: Database,
  region: Pick<TenantRegion, "state" | "city">,
): Promise<{ name: string; slug: string }[]> {
  return database
    .selectDistinct({ name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(supplierProducts, eq(supplierProducts.categoryId, categories.id))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(and(eq(supplierProducts.active, true), eq(suppliers.active, true), coversRegion(region)))
    .orderBy(asc(categories.name));
}

/** The requested products that the region can buy; unknown or out-of-region ids are left out. */
export async function getRegionProducts(
  database: Database,
  input: { region: Pick<TenantRegion, "state" | "city">; tenantId: string },
  productIds: readonly string[],
): Promise<RegionCatalogProduct[]> {
  if (productIds.length === 0) {
    return [];
  }
  const rows = await selectRegionCatalog(database, input.tenantId).where(
    and(
      ...regionCatalogConditions(input, { sort: "title" }),
      inArray(supplierProducts.id, [...productIds]),
    ),
  );
  return rows.map((row) => ({ ...row, imageUrl: row.imageUrls.at(0) ?? null }));
}
