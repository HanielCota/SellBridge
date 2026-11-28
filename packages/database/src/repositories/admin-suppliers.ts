import type { ListingPauseReason } from "@sellbridge/shared/listing-pause-reasons";
import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import { COMBINATION_EDITED_OUTSIDE_GRID_MESSAGE } from "@sellbridge/shared/product-grid";
import {
  defaultSuggestedPriceCents,
  toPaginated,
  type AdminProductValues,
  type AdminSupplierValues,
  type Pagination,
} from "@sellbridge/shared/schemas";
import type { ProductCsvError, ProductCsvRow } from "@sellbridge/shared/product-csv";
import { planGridImport, type GridImportPlan } from "@sellbridge/shared/product-grid-import";
import {
  meetsNewProductRules,
  missingForSale,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import {
  icmsOverrideProblem,
  readProductFiscal,
  withFiscalFallback,
  type FiscalFallback,
  type ProductFiscalPatch,
  type TaxRegime,
} from "@sellbridge/shared/product-fiscal";
import { and, asc, count, eq, getTableColumns, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  categories,
  listings,
  listingTargets,
  member,
  storeConnections,
  storeSuppliers,
  supplierProducts,
  suppliers,
  user,
} from "../schema/index.ts";
import { timestampOf } from "./sql/raw-values.ts";
import { matchesEveryWord } from "./sql/search-pattern.ts";
import { reviewedImportValues } from "./supplier-panel-import-review.ts";
import { getSupplierFiscalFallback } from "./supplier-brand.ts";
import { keptOnCombination } from "./sql/grid-combination.ts";
import {
  loadGridImportContext,
  resolveGrids,
  writePlannedGrids,
  type PlannedGrid,
} from "./supplier-grid-import.ts";
import { publicSupplier, receivingAccountApproved } from "./sql/sellable.ts";

export type AdminSupplier = typeof suppliers.$inferSelect;
export type AdminSupplierProduct = typeof supplierProducts.$inferSelect;
/** A row of the admin supplier list: whether it can be paid through SellBridge rides along. */
export type AdminSupplierListItem = AdminSupplier & { receivingAccountApproved: boolean };

/** Global catalog operations are only exposed through admin-protected server functions. */
export async function listAdminSuppliers(
  database: Database,
  search: string | undefined,
  pagination: Pagination,
  filter: { withoutPanel: boolean } = { withoutPanel: false },
) {
  const searchCondition = search
    ? matchesEveryWord(search, [suppliers.name, suppliers.niche, suppliers.city])
    : undefined;
  // The suppliers the team still runs for them: no panel login, orders only by link.
  const panelCondition = filter.withoutPanel ? isNull(suppliers.organizationId) : undefined;
  const condition = and(publicSupplier(), searchCondition, panelCondition);
  const [total] = await database.select({ value: count() }).from(suppliers).where(condition);
  const items: AdminSupplierListItem[] = await database
    .select({
      ...getTableColumns(suppliers),
      receivingAccountApproved: sql<boolean>`${receivingAccountApproved()}`,
    })
    .from(suppliers)
    .where(condition)
    .orderBy(asc(suppliers.name), asc(suppliers.id))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  return toPaginated(items, total?.value ?? 0, pagination);
}

/** A draft says what keeps it off sale; any other status lists nothing. */
function withMissingForSale(product: AdminSupplierProduct, fallback: FiscalFallback | null) {
  const missing =
    product.reviewStatus === "draft"
      ? missingForSale({
          fiscal: withFiscalFallback(readProductFiscal(product.fiscal), fallback),
          fiscalRequired: product.fiscalRequired,
          weightRequired: product.weightRequired,
          mercadoLivreAttributes: product.mercadoLivreAttributes,
        })
      : [];
  return { ...product, missingForSale: missing };
}

export async function getAdminSupplier(database: DatabaseExecutor, supplierId: string) {
  const [supplier] = await database
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), publicSupplier()))
    .limit(1);
  if (!supplier) {
    throw notFoundError("Fornecedor não encontrado");
  }
  return { supplier };
}

/** A shop that sells the supplier, with its owner, for the admin's "linked sellers" block. */
export interface SupplierSellerStore {
  storeConnectionId: string;
  shopName: string;
  marketplace: (typeof storeConnections.$inferSelect)["marketplace"];
  status: (typeof storeConnections.$inferSelect)["status"];
  tenantId: string;
  ownerId: string | null;
  ownerName: string | null;
  /** Orders of the last 30 days with at least one item of the supplier, in this tenant. */
  recentOrders: number;
}

const SELLER_ORDERS_DAYS = 30;

/** Every live shop selling the supplier, grouped by tenant in the screen. */
export async function listSupplierSellers(
  database: Database,
  supplierId: string,
  now: Date = new Date(),
): Promise<SupplierSellerStore[]> {
  const since = new Date(now.getTime() - SELLER_ORDERS_DAYS * 86_400_000);
  return database
    .select({
      storeConnectionId: storeConnections.id,
      shopName: storeConnections.shopName,
      marketplace: storeConnections.marketplace,
      status: storeConnections.status,
      tenantId: storeConnections.tenantId,
      ownerId: user.id,
      ownerName: user.name,
      recentOrders: sql<number>`(select count(distinct o.id) from orders o
        inner join order_items i on i.order_id = o.id
        inner join supplier_products p on p.id = i.supplier_product_id
        where o.tenant_id = ${storeConnections.tenantId}
          and p.supplier_id = ${supplierId}
          and o.ordered_at >= ${timestampOf(since)})`.mapWith(Number),
    })
    .from(storeConnections)
    .innerJoin(
      storeSuppliers,
      and(
        eq(storeSuppliers.storeConnectionId, storeConnections.id),
        eq(storeSuppliers.supplierId, supplierId),
      ),
    )
    .leftJoin(
      member,
      and(eq(member.organizationId, storeConnections.tenantId), eq(member.role, "owner")),
    )
    .leftJoin(user, eq(user.id, member.userId))
    .where(sql`${storeConnections.status} <> 'disconnected'`)
    .orderBy(asc(user.name), asc(storeConnections.shopName));
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
  const { supplierId, ...values } = input;
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
    .set({ status: "paused", pauseReason: "supplier_unavailable" satisfies ListingPauseReason })
    .where(
      and(eq(listingTargets.status, "published"), inArray(listingTargets.listingId, unsellable)),
    )
    .returning({ id: listingTargets.id });
  return paused.length;
}

/** Also joins a caller's transaction (the 3rd flag deactivates in the flag's own transaction). */
export async function setAdminSupplierActive(
  database: DatabaseExecutor,
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
  const fallback = await getSupplierFiscalFallback(database, supplierId);
  return toPaginated(
    items.map((item) => withMissingForSale(item, fallback)),
    total?.value ?? 0,
    pagination,
  );
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
/**
 * A product created under the fiscal or weight rule leaves sale when the team erases its NCM,
 * origin, unit or weight, as it does when the supplier erases them in the panel, and goes on sale
 * once the team fills them in: the same rule a new team product meets. Only a draft the rule holds
 * (its stored NCM, origin, unit or weight is missing) moves. Panel and spreadsheet drafts carry the
 * rule flags too, so a draft that already meets the rule is the supplier's own choice and stays.
 * The row is locked (as the update would lock it) so the status is judged on what it overwrites.
 */
async function fiscalRuleStatus(
  transaction: DatabaseExecutor,
  ids: { supplierId: string; productId: string },
  values: Pick<AdminProductValues, "fiscal" | "mercadoLivreAttributes">,
  now: Date,
): Promise<{ reviewStatus?: "draft" | "approved"; submittedAt?: Date }> {
  const [stored] = await transaction
    .select({
      fiscal: supplierProducts.fiscal,
      fiscalRequired: supplierProducts.fiscalRequired,
      weightRequired: supplierProducts.weightRequired,
      mercadoLivreAttributes: supplierProducts.mercadoLivreAttributes,
      reviewStatus: supplierProducts.reviewStatus,
    })
    .from(supplierProducts)
    .where(
      and(eq(supplierProducts.id, ids.productId), eq(supplierProducts.supplierId, ids.supplierId)),
    )
    .for("no key update");
  if (
    stored === undefined ||
    (stored.reviewStatus !== "approved" && stored.reviewStatus !== "draft")
  ) {
    return {};
  }
  const fallback = await getSupplierFiscalFallback(transaction, ids.supplierId);
  const meetsRule = (
    fiscal: Parameters<typeof readProductFiscal>[0],
    attributes: Readonly<Record<string, string>>,
  ) =>
    meetsNewProductRules({
      fiscal: withFiscalFallback(readProductFiscal(fiscal), fallback),
      fiscalRequired: stored.fiscalRequired,
      weightRequired: stored.weightRequired,
      mercadoLivreAttributes: attributes,
    });
  const keeps = meetsRule(
    values.fiscal ?? stored.fiscal,
    values.mercadoLivreAttributes ?? stored.mercadoLivreAttributes,
  );
  if (stored.reviewStatus === "approved") {
    return keeps ? {} : { reviewStatus: "draft" };
  }
  const heldByRule = !meetsRule(stored.fiscal, stored.mercadoLivreAttributes);
  return keeps && heldByRule ? { reviewStatus: "approved", submittedAt: now } : {};
}

/** The team form edits a product of its own; a grid combination changes through its model. */
async function assertNotGridCombination(
  transaction: DatabaseExecutor,
  ids: { supplierId: string; productId: string },
): Promise<void> {
  const [product] = await transaction
    .select({ modelId: supplierProducts.modelId })
    .from(supplierProducts)
    .where(
      and(eq(supplierProducts.id, ids.productId), eq(supplierProducts.supplierId, ids.supplierId)),
    );
  if (product !== undefined && product.modelId !== null) {
    throw validationError(COMBINATION_EDITED_OUTSIDE_GRID_MESSAGE);
  }
}

async function updateProduct(
  transaction: DatabaseExecutor,
  ids: { supplierId: string; productId: string },
  values: AdminProductValues,
  expectedStock: number | undefined,
) {
  await assertNotGridCombination(transaction, ids);
  const { stock, ...rest } = values;
  const keepsShelf = expectedStock !== undefined && stock === expectedStock;
  const status = await fiscalRuleStatus(transaction, ids, values, new Date());
  const [product] = await transaction
    .update(supplierProducts)
    .set({ ...(keepsShelf ? rest : values), ...status })
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

/** A product's own ICMS code must fit the supplier's regime, in the team form as in the panel. */
async function assertIcmsFitsSupplierRegime(
  transaction: DatabaseExecutor,
  supplierId: string,
  fiscal: AdminProductValues["fiscal"],
): Promise<void> {
  const [supplier] = await transaction
    .select({ fiscalProfile: suppliers.fiscalProfile })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  const problem = icmsOverrideProblem(fiscal?.icmsCode, supplier?.fiscalProfile?.regime ?? null);
  if (problem !== null) {
    throw validationError(problem);
  }
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
  if (productId === undefined && values.stock < 0) {
    throw validationError("Novos produtos não podem ter estoque negativo");
  }
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, supplierId);
    await assertCategory(transaction, values.categoryId);
    await assertIcmsFitsSupplierRegime(transaction, supplierId, values.fiscal);
    const [duplicate] = await transaction
      .select({ id: supplierProducts.id })
      .from(supplierProducts)
      .where(
        and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.sku, values.sku)),
      );
    if (duplicate && duplicate.id !== productId) {
      throw conflictError("Já existe um produto com este código neste fornecedor");
    }
    const fiscalFallback = await getSupplierFiscalFallback(transaction, supplierId);
    const [product] = productId
      ? [await updateProduct(transaction, { supplierId, productId }, values, expectedStock)]
      : await transaction
          .insert(supplierProducts)
          .values({
            supplierId,
            ...values,
            // A new product needs NF-e data and a weight to go on sale; without them the admin
            // saves a draft.
            fiscalRequired: true,
            weightRequired: true,
            ...(meetsNewProductRules({
              fiscal: withFiscalFallback(readProductFiscal(values.fiscal ?? {}), fiscalFallback),
              fiscalRequired: true,
              weightRequired: true,
              mercadoLivreAttributes: values.mercadoLivreAttributes ?? {},
            })
              ? {}
              : { reviewStatus: "draft" as const }),
          })
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

interface ImportProduct extends Omit<AdminProductValues, "fiscal"> {
  supplierId: string;
  active: boolean;
  /** Only the fiscal cells the line filled; the upsert merges them into what is stored. */
  fiscal?: ProductFiscalPatch | undefined;
}
export interface SupplierProductImportPlan {
  created: number;
  updated: number;
  errors: ProductCsvError[];
  products: ImportProduct[];
  /** SKUs the import creates: they need NF-e data to go on sale (fiscal rule of 10/11/2026). */
  newSkus: string[];
  revision: string;
  /** Colour and size grids the import creates or grows (only while grids are on). */
  grids: PlannedGrid[];
  /** What the supplier should know but need not fix, by line. */
  notices: ProductCsvError[];
}

function planImportRows(input: {
  supplierId: string;
  rows: readonly ProductCsvRow[];
  existing: AdminSupplierProduct[];
  availableCategories: Awaited<ReturnType<typeof listAdminCategories>>;
  /** The supplier's regime, to check a line's own ICMS code; null while it is not filled. */
  regime: TaxRegime | null;
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
    newSkus: [],
    revision: "",
    grids: [],
    notices: [],
  };
  for (const row of input.rows) {
    const { categorySlug, suggestedPriceCents, ...product } = row.product;
    const categoryId = categorySlug ? categoryBySlug.get(categorySlug) : null;
    if (categoryId === undefined) {
      plan.errors.push({ line: row.line, reason: `Categoria desconhecida: ${categorySlug}` });
      continue;
    }
    const icmsProblem = icmsOverrideProblem(product.fiscal?.icmsCode, input.regime);
    if (icmsProblem !== null) {
      plan.errors.push({ line: row.line, reason: icmsProblem });
      continue;
    }
    const previous = existingBySku.get(product.sku);
    plan[previous ? "updated" : "created"] += 1;
    if (previous === undefined) {
      plan.newSkus.push(product.sku);
    }
    plan.products.push({
      ...product,
      active: product.active ?? previous?.active ?? true,
      supplierId: input.supplierId,
      categoryId,
      suggestedPriceCents:
        suggestedPriceCents ??
        previous?.suggestedPriceCents ??
        defaultSuggestedPriceCents(product.costCents),
    });
  }
  plan.revision = importRevision(input, plan.products);
  return plan;
}

/**
 * Only what the import writes: a sale moving `reserved_stock` (or `updated_at`) between the
 * preview and the confirmation must not invalidate it; a new shelf count must.
 */
function importRevision(
  input: {
    existing: AdminSupplierProduct[];
    availableCategories: Awaited<ReturnType<typeof listAdminCategories>>;
  },
  products: readonly ImportProduct[],
): string {
  return JSON.stringify({
    existing: input.existing.map((product) => ({
      sku: product.sku,
      title: product.title,
      description: product.description,
      costCents: product.costCents,
      stock: product.stock,
      categoryId: product.categoryId,
      imageUrls: product.imageUrls,
      active: product.active,
      suggestedPriceCents: product.suggestedPriceCents,
      mercadoLivreAttributes: product.mercadoLivreAttributes,
      fiscal: product.fiscal,
    })),
    categories: input.availableCategories.map((category) => [category.slug, category.id]),
    products,
  });
}

export async function previewSupplierProductImport(
  database: DatabaseExecutor,
  supplierId: string,
  rows: readonly ProductCsvRow[],
) {
  const { supplier } = await getAdminSupplier(database, supplierId);
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
  const gridPlan = planGridImport({
    rows,
    ...(await loadGridImportContext(database, supplierId, rows)),
  });
  const plan = planImportRows({
    supplierId,
    rows: gridPlan.plainRows,
    existing,
    availableCategories,
    regime: supplier.fiscalProfile?.regime ?? null,
  });
  return withGrids(plan, gridPlan, availableCategories);
}

// A new grid counts as one new product and a grown one as one updated product, as the
// supplier's product list shows them (one row per grid).
function withGrids(
  plan: SupplierProductImportPlan,
  gridPlan: GridImportPlan,
  availableCategories: Awaited<ReturnType<typeof listAdminCategories>>,
): SupplierProductImportPlan {
  const categoryBySlug = new Map(
    availableCategories.map((category) => [category.slug, category.id]),
  );
  const resolved = resolveGrids(gridPlan.grids, (slug) => categoryBySlug.get(slug));
  const newGrids = resolved.grids.filter((grid) => grid.modelId === null).length;
  return {
    ...plan,
    created: plan.created + newGrids,
    updated: plan.updated + (resolved.grids.length - newGrids),
    errors: [...plan.errors, ...gridPlan.errors, ...resolved.errors].toSorted(
      (first, second) => first.line - second.line,
    ),
    grids: resolved.grids,
    notices: [...gridPlan.notices],
    revision: JSON.stringify([plan.revision, resolved.grids]),
  };
}

/**
 * A product the import creates needs NCM, origin, unit and a weight to go on sale: it is flagged
 * as such and, when the line leaves them out, lands as a draft instead of approved. Updated
 * products keep their flags and status (the conflict clause does not touch them).
 */
function withNewProductFiscalRule<
  TProduct extends {
    sku: string;
    fiscal?: ProductFiscalPatch | undefined;
    mercadoLivreAttributes?: Record<string, string> | undefined;
  },
>(products: readonly TProduct[], newSkus: readonly string[], fallback: FiscalFallback | null) {
  const created = new Set(newSkus);
  return products.map((product) => {
    if (!created.has(product.sku)) {
      return { ...product, fiscal: product.fiscal ?? {} };
    }
    const complete = meetsNewProductRules({
      fiscal: withFiscalFallback(readProductFiscal(product.fiscal ?? {}), fallback),
      fiscalRequired: true,
      weightRequired: true,
      mercadoLivreAttributes: product.mercadoLivreAttributes ?? {},
    });
    return {
      ...product,
      fiscal: product.fiscal ?? {},
      fiscalRequired: true,
      weightRequired: true,
      ...(complete ? {} : { reviewStatus: "draft" as const }),
    };
  });
}

/**
 * What an import writes over a product it finds by SKU. A grid combination takes only its own
 * values (cost, stock, price, on sale); its shared data comes from its model.
 */
function importedValuesSet() {
  return {
    title: keptOnCombination(sql`excluded.title`, supplierProducts.title),
    description: keptOnCombination(sql`excluded.description`, supplierProducts.description),
    costCents: sql`excluded.cost_cents`,
    stock: sql`excluded.stock`,
    categoryId: keptOnCombination(sql`excluded.category_id`, supplierProducts.categoryId),
    imageUrls: keptOnCombination(sql`excluded.image_urls`, supplierProducts.imageUrls),
    active: sql`excluded.active`,
    suggestedPriceCents: sql`excluded.suggested_price_cents`,
    // Item 18: the CSV's attributes win; blank cells (absent keys) keep the product's own.
    mercadoLivreAttributes: keptOnCombination(
      sql`${supplierProducts.mercadoLivreAttributes} || excluded.mercado_livre_attributes`,
      supplierProducts.mercadoLivreAttributes,
    ),
    // Same for the fiscal cells; `fiscal_required` is left as the stored product has it.
    fiscal: keptOnCombination(
      sql`${supplierProducts.fiscal} || excluded.fiscal`,
      supplierProducts.fiscal,
    ),
  };
}

/** The plan's products of their own and existing combinations, by SKU, as the import always wrote them. */
async function writeImportedProducts(
  transaction: DatabaseExecutor,
  input: { supplierId: string; reviewAt?: Date },
  plan: SupplierProductImportPlan,
): Promise<string[]> {
  if (plan.products.length === 0) {
    return [];
  }
  const reviewed = await reviewedImportValues(transaction, input, plan.products);
  const fiscalFallback = await getSupplierFiscalFallback(transaction, input.supplierId);
  const written = await transaction
    .insert(supplierProducts)
    .values(
      withNewProductFiscalRule(reviewed?.values ?? plan.products, plan.newSkus, fiscalFallback),
    )
    .onConflictDoUpdate({
      target: [supplierProducts.supplierId, supplierProducts.sku],
      set: { ...importedValuesSet(), ...reviewed?.conflictSet, updatedAt: new Date() },
    })
    .returning({ id: supplierProducts.id });
  return written.map((product) => product.id);
}

/** All rows commit together; conflicts preserve product ids and therefore listing/order references. */
export async function importSupplierProducts(
  database: Database,
  input: {
    supplierId: string;
    rows: readonly ProductCsvRow[];
    validatePreview: (plan: SupplierProductImportPlan) => void;
    /** Set for the supplier's own import: rows go through review instead of being approved. */
    reviewAt?: Date;
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
    if (plan.errors.length > 0 || (plan.products.length === 0 && plan.grids.length === 0)) {
      throw validationError("Corrija os erros do CSV antes de importar");
    }
    const written = await writeImportedProducts(transaction, input, plan);
    const gridIds = await writePlannedGrids(transaction, input.supplierId, plan.grids);
    const pausedTargets = await pauseUnsellableListings(transaction, input.supplierId);
    return {
      created: plan.created,
      updated: plan.updated,
      pausedTargets,
      productIds: [...written, ...gridIds],
    };
  });
}
