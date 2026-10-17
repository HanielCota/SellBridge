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
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../client.ts";
import { containsPattern, matchesEveryWord } from "./sql/search-pattern.ts";
import { categories, listings, supplierProducts, suppliers } from "../schema/index.ts";
import { availableStock } from "./sql/available-stock.ts";
import { productListable } from "./sql/sellable.ts";

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

/** Every active supplier, for pickers and filters: any reseller sells any supplier. */
export async function listActiveSuppliers(
  database: Database,
  filters: ListSuppliersFilters,
): Promise<SupplierSummary[]> {
  const conditions: SQL[] = [eq(suppliers.active, true)];
  if (filters.niche) {
    conditions.push(eq(suppliers.niche, filters.niche));
  }
  if (filters.search) {
    conditions.push(ilike(suppliers.name, containsPattern(filters.search)));
  }
  const productCount = sql<number>`(select count(*) from ${supplierProducts} where ${and(
    eq(supplierProducts.supplierId, suppliers.id),
    productListable(),
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

export interface SupplierDirectoryFilters extends ListSuppliersFilters {
  /** The supplier's state (UF), where it ships from. */
  state?: string | undefined;
  /** The supplier's city, matched ignoring case and accents. */
  city?: string | undefined;
}

/**
 * The search a reseller types is a niche or a product they want to sell: it matches the
 * supplier's name or niche, or the title of any of its active products.
 */
function nicheOrProductMatch(search: string): SQL | undefined {
  const onSupplier = matchesEveryWord(search, [suppliers.name, suppliers.niche]);
  const onProduct = matchesEveryWord(search, [supplierProducts.title]);
  if (!onSupplier || !onProduct) {
    return undefined;
  }
  return or(
    onSupplier,
    exists(
      sql`(select 1 from ${supplierProducts} where ${and(
        eq(supplierProducts.supplierId, suppliers.id),
        productListable(),
        onProduct,
      )})`,
    ),
  );
}

function directoryConditions(filters: SupplierDirectoryFilters): SQL[] {
  const conditions: SQL[] = [eq(suppliers.active, true)];
  if (filters.niche) {
    conditions.push(eq(suppliers.niche, filters.niche));
  }
  const searchCondition = filters.search ? nicheOrProductMatch(filters.search) : undefined;
  if (searchCondition) {
    conditions.push(searchCondition);
  }
  if (filters.state) {
    conditions.push(eq(suppliers.state, filters.state));
  }
  if (filters.city) {
    conditions.push(sql`sellbridge_fold(${suppliers.city}) = sellbridge_fold(${filters.city})`);
  }
  return conditions;
}

/** A state with active suppliers, and the cities they are in, for the directory filters. */
export interface SupplierLocation {
  state: string;
  cities: string[];
}

export async function listSupplierLocations(database: Database): Promise<SupplierLocation[]> {
  const rows = await database
    .selectDistinct({ state: suppliers.state, city: suppliers.city })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.state), asc(suppliers.city));
  const byState = new Map<string, string[]>();
  for (const row of rows) {
    byState.set(row.state, [...(byState.get(row.state) ?? []), row.city]);
  }
  return [...byState].map(([state, cities]) => ({ state, cities }));
}

/** Every active supplier, from anywhere in Brazil: any reseller sells any of them. */
export async function listSupplierDirectory(
  database: Database,
  filters: SupplierDirectoryFilters,
): Promise<SupplierSummary[]> {
  const productCount = sql<number>`(select count(*) from ${supplierProducts} where ${and(
    eq(supplierProducts.supplierId, suppliers.id),
    productListable(),
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
    .where(and(...directoryConditions(filters)))
    .orderBy(asc(suppliers.name));
}

/** Niches of every active supplier, for the shortcuts above the directory. */
export async function listActiveNiches(database: Database): Promise<string[]> {
  const rows = await database
    .selectDistinct({ niche: suppliers.niche })
    .from(suppliers)
    .where(eq(suppliers.active, true))
    .orderBy(asc(suppliers.niche));
  return rows.map((row) => row.niche);
}

/** Any active supplier, to browse its catalog and sell it. */
export async function getDirectorySupplier(
  database: Database,
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
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.active, true)))
    .limit(1);
  if (!supplier) {
    throw notFoundError("Fornecedor não encontrado");
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
  const conditions: SQL[] = [eq(supplierProducts.supplierId, supplierId), productListable()];
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
        productListable(),
        eq(suppliers.active, true),
      ),
    )
    .orderBy(asc(categories.name));
}

/** Detail of an active product of an active supplier, the one a listing is created from. */
export async function getSellableCatalogProduct(
  database: Database,
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
    .where(and(eq(supplierProducts.id, productId), productListable(), eq(suppliers.active, true)))
    .limit(1);
  if (row === undefined) {
    throw notFoundError("Produto não encontrado no catálogo");
  }
  return { ...row, imageUrl: row.imageUrls.at(0) ?? null };
}

export interface SellableCatalogFilters {
  search?: string | undefined;
  categorySlug?: string | undefined;
  supplierId?: string | undefined;
  inStockOnly?: boolean | undefined;
  unpublishedOnly?: boolean | undefined;
  sort: ProductSort;
}

export interface SellableCatalogProduct extends CatalogProduct {
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

function sellableCatalogConditions(tenantId: string, filters: SellableCatalogFilters): SQL[] {
  const conditions: SQL[] = [productListable(), eq(suppliers.active, true)];
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
    conditions.push(sql`not ${isPublishedBy(tenantId)}`);
  }
  return conditions;
}

function selectSellableCatalog(database: Database, tenantId: string) {
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

/** Every active product of every active supplier, in one list, marking what the tenant sells. */
export async function listSellableCatalog(
  database: Database,
  tenantId: string,
  filters: SellableCatalogFilters,
  pagination: Pagination,
): Promise<Paginated<SellableCatalogProduct>> {
  const where = and(...sellableCatalogConditions(tenantId, filters));
  // The count and the page are independent reads: run them together.
  const [[totalRow], rows] = await Promise.all([
    database
      .select({ total: count() })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .leftJoin(categories, eq(categories.id, supplierProducts.categoryId))
      .where(where),
    selectSellableCatalog(database, tenantId)
      .where(where)
      .orderBy(...PRODUCT_ORDER[filters.sort])
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
  ]);
  const items = rows.map((row) => ({ ...row, imageUrl: row.imageUrls.at(0) ?? null }));
  return toPaginated(items, totalRow?.total ?? 0, pagination);
}

/** Categories with at least one active product of an active supplier. */
export async function listSellableCategories(
  database: Database,
): Promise<{ name: string; slug: string }[]> {
  return database
    .selectDistinct({ name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(supplierProducts, eq(supplierProducts.categoryId, categories.id))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(and(productListable(), eq(suppliers.active, true)))
    .orderBy(asc(categories.name));
}

/** The requested products the tenant can sell; unknown or inactive ids are left out. */
export async function getSellableProducts(
  database: Database,
  tenantId: string,
  productIds: readonly string[],
): Promise<SellableCatalogProduct[]> {
  if (productIds.length === 0) {
    return [];
  }
  const rows = await selectSellableCatalog(database, tenantId).where(
    and(
      ...sellableCatalogConditions(tenantId, { sort: "title" }),
      inArray(supplierProducts.id, [...productIds]),
    ),
  );
  return rows.map((row) => ({ ...row, imageUrl: row.imageUrls.at(0) ?? null }));
}
