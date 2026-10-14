import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import {
  LISTING_MAX_PRICE_CENTS,
  priceForRule,
  toPaginated,
  type AdminProductValues,
  type AdminSupplierValues,
  type Pagination,
} from "@sellbridge/shared/schemas";
import type { ProductCsvError, ProductCsvRow } from "@sellbridge/shared/product-csv";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  categories,
  listings,
  listingTargets,
  supplierCoverage,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { matchesEveryWord } from "./sql/search-pattern.ts";

export type AdminSupplier = typeof suppliers.$inferSelect;
export type AdminSupplierProduct = typeof supplierProducts.$inferSelect;

/** Global catalog operations are only exposed through admin-protected server functions. */
export async function listAdminSuppliers(
  database: Database,
  search: string | undefined,
  pagination: Pagination,
) {
  const condition = search
    ? matchesEveryWord(search, [suppliers.name, suppliers.niche, suppliers.city])
    : undefined;
  const [total] = await database.select({ value: count() }).from(suppliers).where(condition);
  const items = await database
    .select()
    .from(suppliers)
    .where(condition)
    .orderBy(asc(suppliers.name), asc(suppliers.id))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  return toPaginated(items, total?.value ?? 0, pagination);
}

export async function getAdminSupplier(database: DatabaseExecutor, supplierId: string) {
  const [supplier] = await database
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!supplier) {
    throw notFoundError("Fornecedor não encontrado");
  }
  const coverage = await database
    .select({ state: supplierCoverage.state, city: supplierCoverage.city })
    .from(supplierCoverage)
    .where(eq(supplierCoverage.supplierId, supplierId))
    .orderBy(asc(supplierCoverage.state), asc(supplierCoverage.city));
  return { supplier, coverage };
}

/** Serializes all admin writes for one supplier, including CSV preview confirmation. */
async function lockSupplier(database: DatabaseExecutor, supplierId: string): Promise<void> {
  const [supplier] = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .for("update");
  if (!supplier) {
    throw notFoundError("Fornecedor não encontrado");
  }
}

export async function saveAdminSupplier(
  database: Database,
  input: AdminSupplierValues & { supplierId?: string | undefined },
) {
  const { supplierId, coverage, ...values } = input;
  return await database.transaction(async (transaction) => {
    if (supplierId) {
      await lockSupplier(transaction, supplierId);
    }
    const [supplier] = supplierId
      ? await transaction
          .update(suppliers)
          .set(values)
          .where(eq(suppliers.id, supplierId))
          .returning()
      : await transaction.insert(suppliers).values(values).returning();
    if (!supplier) {
      throw notFoundError("Fornecedor não encontrado");
    }
    await transaction.delete(supplierCoverage).where(eq(supplierCoverage.supplierId, supplier.id));
    await transaction
      .insert(supplierCoverage)
      .values(coverage.map((region) => ({ supplierId: supplier.id, ...region })));
    return supplier;
  });
}

/**
 * Pauses the live listings of the supplier's products that can no longer be sold (product or
 * supplier inactive), for every reseller; returns how many. Paused listings sync zero stock, and
 * coming back does not resume them: each reseller decides. Never touches a paused listing.
 */
async function pauseUnsellableListings(
  transaction: DatabaseExecutor,
  supplierId: string,
): Promise<number> {
  const unsellable = transaction
    .select({ id: listings.id })
    .from(listings)
    .innerJoin(supplierProducts, eq(supplierProducts.id, listings.supplierProductId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        or(eq(supplierProducts.active, false), eq(suppliers.active, false)),
      ),
    );
  const paused = await transaction
    .update(listingTargets)
    .set({ status: "paused" })
    .where(
      and(eq(listingTargets.status, "published"), inArray(listingTargets.listingId, unsellable)),
    )
    .returning({ id: listingTargets.id });
  return paused.length;
}

export async function setAdminSupplierActive(
  database: Database,
  supplierId: string,
  active: boolean,
) {
  return await database.transaction(async (transaction) => {
    const [supplier] = await transaction
      .update(suppliers)
      .set({ active })
      .where(eq(suppliers.id, supplierId))
      .returning();
    if (!supplier) {
      throw notFoundError("Fornecedor não encontrado");
    }
    return { supplier, pausedTargets: await pauseUnsellableListings(transaction, supplierId) };
  });
}

export async function listAdminSupplierProducts(
  database: Database,
  supplierId: string,
  search: string | undefined,
  pagination: Pagination,
) {
  await getAdminSupplier(database, supplierId);
  const condition = and(
    eq(supplierProducts.supplierId, supplierId),
    search ? matchesEveryWord(search, [supplierProducts.sku, supplierProducts.title]) : undefined,
  );
  const [total] = await database.select({ value: count() }).from(supplierProducts).where(condition);
  const items = await database
    .select()
    .from(supplierProducts)
    .where(condition)
    .orderBy(asc(supplierProducts.title), asc(supplierProducts.id))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  return toPaginated(items, total?.value ?? 0, pagination);
}

export async function listAdminCategories(database: DatabaseExecutor) {
  return await database.select().from(categories).orderBy(asc(categories.name));
}

async function assertCategory(
  database: DatabaseExecutor,
  categoryId: string | null,
): Promise<void> {
  if (!categoryId) {
    return;
  }
  const [category] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (!category) {
    throw validationError("Categoria não encontrada");
  }
}

const STOCK_MOVED_MESSAGE =
  "O estoque deste produto mudou depois que você abriu o formulário (venda ou importação). Recarregue e confira antes de salvar.";

/**
 * Saves an edit without undoing sales: an untouched shelf count is not written back, and a
 * changed one only lands while the shelf still holds what the form showed.
 */
async function updateProduct(
  transaction: DatabaseExecutor,
  ids: { supplierId: string; productId: string },
  values: AdminProductValues,
  expectedStock: number | undefined,
) {
  const { stock, ...rest } = values;
  const keepsShelf = expectedStock !== undefined && stock === expectedStock;
  const [product] = await transaction
    .update(supplierProducts)
    .set(keepsShelf ? rest : values)
    .where(
      and(
        eq(supplierProducts.id, ids.productId),
        eq(supplierProducts.supplierId, ids.supplierId),
        expectedStock === undefined || keepsShelf
          ? undefined
          : eq(supplierProducts.stock, expectedStock),
      ),
    )
    .returning();
  if (product || expectedStock === undefined) {
    return product;
  }
  const [exists] = await transaction
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .where(
      and(eq(supplierProducts.id, ids.productId), eq(supplierProducts.supplierId, ids.supplierId)),
    );
  if (exists) {
    throw conflictError(STOCK_MOVED_MESSAGE);
  }
  return undefined;
}

export async function saveAdminSupplierProduct(
  database: Database,
  input: AdminProductValues & {
    supplierId: string;
    productId?: string | undefined;
    expectedStock?: number | undefined;
  },
) {
  const { supplierId, productId, expectedStock, ...values } = input;
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, supplierId);
    await assertCategory(transaction, values.categoryId);
    const [duplicate] = await transaction
      .select({ id: supplierProducts.id })
      .from(supplierProducts)
      .where(
        and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.sku, values.sku)),
      );
    if (duplicate && duplicate.id !== productId) {
      throw conflictError("Já existe um produto com este SKU neste fornecedor");
    }
    const [product] = productId
      ? [await updateProduct(transaction, { supplierId, productId }, values, expectedStock)]
      : await transaction
          .insert(supplierProducts)
          .values({ supplierId, ...values })
          .returning();
    if (!product) {
      throw notFoundError("Produto não encontrado neste fornecedor");
    }
    return product;
  });
}

export async function setAdminSupplierProductActive(
  database: Database,
  input: { supplierId: string; productId: string; active: boolean },
) {
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, input.supplierId);
    const [product] = await transaction
      .update(supplierProducts)
      .set({ active: input.active })
      .where(
        and(
          eq(supplierProducts.id, input.productId),
          eq(supplierProducts.supplierId, input.supplierId),
        ),
      )
      .returning();
    if (!product) {
      throw notFoundError("Produto não encontrado neste fornecedor");
    }
    return { product, pausedTargets: await pauseUnsellableListings(transaction, input.supplierId) };
  });
}

interface ImportProduct extends AdminProductValues {
  supplierId: string;
  active: boolean;
}
export interface SupplierProductImportPlan {
  created: number;
  updated: number;
  errors: ProductCsvError[];
  products: ImportProduct[];
  revision: string;
}

function planImportRows(input: {
  supplierId: string;
  rows: readonly ProductCsvRow[];
  existing: AdminSupplierProduct[];
  availableCategories: Awaited<ReturnType<typeof listAdminCategories>>;
}): SupplierProductImportPlan {
  const existingBySku = new Map(input.existing.map((product) => [product.sku, product]));
  const categoryBySlug = new Map(
    input.availableCategories.map((category) => [category.slug, category.id]),
  );
  const plan: SupplierProductImportPlan = {
    created: 0,
    updated: 0,
    errors: [],
    products: [],
    revision: "",
  };
  for (const row of input.rows) {
    const { categorySlug, suggestedPriceCents, ...product } = row.product;
    const categoryId = categorySlug ? categoryBySlug.get(categorySlug) : null;
    if (categoryId === undefined) {
      plan.errors.push({ line: row.line, reason: `Categoria desconhecida: ${categorySlug}` });
      continue;
    }
    const previous = existingBySku.get(product.sku);
    plan[previous ? "updated" : "created"] += 1;
    plan.products.push({
      ...product,
      active: product.active ?? previous?.active ?? true,
      supplierId: input.supplierId,
      categoryId,
      suggestedPriceCents:
        suggestedPriceCents ??
        previous?.suggestedPriceCents ??
        Math.min(
          LISTING_MAX_PRICE_CENTS,
          priceForRule({ ...product, suggestedPriceCents: 0 }, { kind: "markup", percent: 50 }),
        ),
    });
  }
  plan.revision = JSON.stringify({
    existing: input.existing,
    categories: input.availableCategories.map((category) => [category.slug, category.id]),
    products: plan.products,
  });
  return plan;
}

export async function previewSupplierProductImport(
  database: DatabaseExecutor,
  supplierId: string,
  rows: readonly ProductCsvRow[],
) {
  await getAdminSupplier(database, supplierId);
  const existing =
    rows.length === 0
      ? []
      : await database
          .select()
          .from(supplierProducts)
          .where(
            and(
              eq(supplierProducts.supplierId, supplierId),
              inArray(
                supplierProducts.sku,
                rows.map((row) => row.product.sku),
              ),
            ),
          )
          .orderBy(asc(supplierProducts.sku));
  const availableCategories = await listAdminCategories(database);
  return planImportRows({ supplierId, rows, existing, availableCategories });
}

/** All rows commit together; conflicts preserve product ids and therefore listing/order references. */
export async function importSupplierProducts(
  database: Database,
  input: {
    supplierId: string;
    rows: readonly ProductCsvRow[];
    validatePreview: (plan: SupplierProductImportPlan) => void;
  },
) {
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, input.supplierId);
    // Sales lock products in id order; taking them in the same order first means an import
    // and a sale wait for each other instead of deadlocking. "No key update" is enough for the
    // upsert and does not collide with the key-share locks a new order item takes on insert.
    await transaction
      .select({ id: supplierProducts.id })
      .from(supplierProducts)
      .where(eq(supplierProducts.supplierId, input.supplierId))
      .orderBy(asc(supplierProducts.id))
      .for("no key update");
    const plan = await previewSupplierProductImport(transaction, input.supplierId, input.rows);
    input.validatePreview(plan);
    if (plan.errors.length > 0 || plan.products.length === 0) {
      throw validationError("Corrija os erros do CSV antes de importar");
    }
    await transaction
      .insert(supplierProducts)
      .values(plan.products)
      .onConflictDoUpdate({
        target: [supplierProducts.supplierId, supplierProducts.sku],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          costCents: sql`excluded.cost_cents`,
          stock: sql`excluded.stock`,
          categoryId: sql`excluded.category_id`,
          imageUrls: sql`excluded.image_urls`,
          active: sql`excluded.active`,
          suggestedPriceCents: sql`excluded.suggested_price_cents`,
          updatedAt: new Date(),
        },
      });
    const pausedTargets = await pauseUnsellableListings(transaction, input.supplierId);
    return { created: plan.created, updated: plan.updated, pausedTargets };
  });
}
