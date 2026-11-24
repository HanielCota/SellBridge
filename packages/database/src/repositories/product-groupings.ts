import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import {
  combinationOwnFields,
  gridStructureProblems,
  materializeCombination,
  MAX_OPTION_PHOTOS,
  sharedAttributes,
  sortSizeNames,
  type ProductGrid,
  type ProductModelShared,
} from "@sellbridge/shared/product-grid";
import {
  canGroup,
  groupingProblems,
  suggestGroupings,
  type GroupingProblems,
  type GroupingProduct,
  type GroupProductsInput,
  type SharedFiscal,
} from "@sellbridge/shared/product-grouping";
import {
  hasRequiredFiscalData,
  readProductFiscal,
  withFiscalFallback,
  type FiscalFallback,
} from "@sellbridge/shared/product-fiscal";
import { stripAccents } from "@sellbridge/shared/text";
import { logger } from "@sellbridge/shared/logger";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  listings,
  listingTargets,
  productGroupingItems,
  productGroupings,
  productModels,
  supplierProducts,
} from "../schema/index.ts";
import { modelHasListingFamily } from "./listing-families.ts";
import { categorySlugOf, saleProblems } from "./product-model-drafts.ts";
import { getProductModel, insertOptions, lockSupplier, modelCodeFor } from "./product-models.ts";
import { getSupplierFiscalFallback } from "./supplier-brand.ts";

type ProductRow = typeof supplierProducts.$inferSelect;

/** One product of a suggestion, as the card shows it. */
export interface GroupingSuggestionProduct {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly imageUrl: string | null;
  readonly stock: number;
  readonly reservedStock: number;
  readonly active: boolean;
  readonly approved: boolean;
  /** Resellers' publications on the air that sell this product. */
  readonly liveListings: number;
  readonly categoryId: string | null;
  readonly fiscal: SharedFiscal;
  readonly color: string | null;
  readonly size: string | null;
}

export interface GroupingSuggestionView {
  readonly key: string;
  readonly modelTitle: string;
  readonly mainProductId: string;
  readonly products: readonly GroupingSuggestionProduct[];
}

const SALE_PHOTO_POINTS = 3;
const FISCAL_POINTS = 100;
const APPROVED_POINTS = 1000;
const DESCRIPTION_POINTS = 5;
/**
 * Suggestions read at most this many products outside a grid (by SKU): well above the biggest
 * catalog today (508), and a bound on what one screen load costs.
 */
export const MAX_GROUPING_CANDIDATES = 5000;

function sharedFiscalOf(fiscal: unknown, fallback: FiscalFallback | null): SharedFiscal {
  const read = withFiscalFallback(readProductFiscal(fiscal), fallback);
  return { ncm: read.ncm, origin: read.origin, unit: read.unit };
}

/**
 * Photos, sheet answers and description, counted by the database: the screen never reads them,
 * only how filled in each product is.
 */
const contentPoints = sql<number>`(least(cardinality(${supplierProducts.imageUrls}), ${sql.raw(String(MAX_OPTION_PHOTOS))}) * ${sql.raw(String(SALE_PHOTO_POINTS))} + (select count(*) from jsonb_object_keys(${supplierProducts.mercadoLivreAttributes})) + case when btrim(${supplierProducts.description}) = '' then 0 else ${sql.raw(String(DESCRIPTION_POINTS))} end)::int`;

/** The suggested main product is the one that loses least as the model: sold, fiscal, photos. */
function completenessOf(
  row: { reviewStatus: string; fiscal: unknown; contentPoints: number },
  fallback: FiscalFallback | null,
): number {
  const fiscal = withFiscalFallback(readProductFiscal(row.fiscal), fallback);
  return (
    (row.reviewStatus === "approved" ? APPROVED_POINTS : 0) +
    (hasRequiredFiscalData(fiscal) ? FISCAL_POINTS : 0) +
    row.contentPoints
  );
}

async function liveListingsByProduct(
  executor: DatabaseExecutor,
  productIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (productIds.length === 0) {
    return new Map();
  }
  const rows = await executor
    .select({ productId: listings.supplierProductId, live: count() })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(
      and(
        inArray(listings.supplierProductId, [...productIds]),
        eq(listingTargets.status, "published"),
      ),
    )
    .groupBy(listings.supplierProductId);
  return new Map(rows.map((row) => [row.productId, row.live]));
}

/**
 * The groups of products outside any grid that look like one model (`suggestGroupings`), with
 * what each card shows. Read-only.
 */
export async function listGroupingSuggestions(
  executor: DatabaseExecutor,
  supplierId: string,
): Promise<GroupingSuggestionView[]> {
  const [fallback, rows] = await Promise.all([
    getSupplierFiscalFallback(executor, supplierId),
    executor
      .select({
        id: supplierProducts.id,
        sku: supplierProducts.sku,
        title: supplierProducts.title,
        categoryId: supplierProducts.categoryId,
        imageUrl: sql<string | null>`${supplierProducts.imageUrls}[1]`,
        contentPoints,
        fiscal: supplierProducts.fiscal,
        stock: supplierProducts.stock,
        reservedStock: supplierProducts.reservedStock,
        active: supplierProducts.active,
        reviewStatus: supplierProducts.reviewStatus,
      })
      .from(supplierProducts)
      .where(and(eq(supplierProducts.supplierId, supplierId), isNull(supplierProducts.modelId)))
      .orderBy(asc(supplierProducts.sku))
      .limit(MAX_GROUPING_CANDIDATES),
  ]);
  if (rows.length === MAX_GROUPING_CANDIDATES) {
    logger.warn("product_grouping.candidates_capped", { supplierId, read: rows.length });
  }
  const suggestions = suggestGroupings(
    rows.map((row) => ({ ...row, completeness: completenessOf(row, fallback) })),
  );
  const live = await liveListingsByProduct(
    executor,
    suggestions.flatMap((suggestion) => suggestion.products.map((entry) => entry.product.id)),
  );
  return suggestions.map((suggestion) => ({
    key: suggestion.key,
    modelTitle: suggestion.modelTitle,
    mainProductId: suggestion.mainProductId,
    products: suggestion.products.map(({ product, color, size }) => ({
      id: product.id,
      sku: product.sku,
      title: product.title,
      imageUrl: product.imageUrl,
      stock: product.stock,
      reservedStock: product.reservedStock,
      active: product.active,
      approved: product.reviewStatus === "approved",
      liveListings: live.get(product.id) ?? 0,
      categoryId: product.categoryId,
      fiscal: sharedFiscalOf(product.fiscal, fallback),
      color,
      size,
    })),
  }));
}

function optionKey(name: string): string {
  return stripAccents(name).trim().replaceAll(/\s+/g, " ").toLowerCase();
}

/** "Preto" and "preto " typed on two products are one colour, spelled as first typed. */
function canonicalNames(names: readonly (string | null)[]): ReadonlyMap<string, string> {
  const byKey = new Map<string, string>();
  for (const name of names) {
    if (name !== null && !byKey.has(optionKey(name))) {
      byKey.set(optionKey(name), name);
    }
  }
  return byKey;
}

interface Choice {
  readonly row: ProductRow;
  readonly color: string | null;
  readonly size: string | null;
}

function canonical(names: ReadonlyMap<string, string>, name: string | null): string | null {
  return name === null ? null : (names.get(optionKey(name)) ?? name);
}

/** The grid the products become: each colour's photos are its products' photos, in order. */
function gridOf(choices: readonly Choice[]): ProductGrid {
  const colors = [...new Set(choices.map((choice) => choice.color))].filter(
    (name) => name !== null,
  );
  const sizes = sortSizeNames(
    [...new Set(choices.map((choice) => choice.size))].filter((name) => name !== null),
  );
  return {
    colors: colors.map((name) => ({
      name,
      imageUrls: [
        ...new Set(
          choices
            .filter((choice) => choice.color === name)
            .flatMap((choice) => choice.row.imageUrls),
        ),
      ].slice(0, MAX_OPTION_PHOTOS),
    })),
    sizes,
    combinations: choices.map((choice) => ({
      color: choice.color,
      size: choice.size,
      sku: choice.row.sku,
      gtin: choice.row.mercadoLivreAttributes.GTIN ?? null,
      costCents: choice.row.costCents,
      suggestedPriceCents: choice.row.suggestedPriceCents,
      stock: choice.row.stock,
      netWeightGrams: readProductFiscal(choice.row.fiscal).netWeightGrams,
    })),
  };
}

/** The model takes what the main product has: the grid rewrites the others from it. */
function modelValues(main: ProductRow, modelTitle: string): ProductModelShared {
  return {
    title: modelTitle,
    description: main.description,
    categoryId: main.categoryId,
    imageUrls: main.imageUrls,
    mercadoLivreAttributes: sharedAttributes(main.mercadoLivreAttributes),
    mercadoLivreCategoryId: main.mercadoLivreCategoryId,
    mercadoLivreCategoryName: main.mercadoLivreCategoryName,
    warrantyType: main.warrantyType,
    warrantyDays: main.warrantyDays,
    videoUrl: main.videoUrl,
    madeToOrderDays: main.madeToOrderDays,
    carrierOnly: main.carrierOnly,
    fiscal: main.fiscal,
  };
}

function rewritten(choice: Choice, values: ProductModelShared, grid: ProductGrid) {
  const combination = grid.combinations.find((entry) => entry.sku === choice.row.sku);
  if (combination === undefined) {
    throw new Error(`grouped product ${choice.row.id} is missing from its grid`);
  }
  const own = combinationOwnFields(combination);
  const colorImageUrls = grid.colors.find((color) => color.name === choice.color)?.imageUrls ?? [];
  return {
    modelColumns: { color: choice.color, size: choice.size, ...own },
    product: materializeCombination(values, {
      color: choice.color,
      size: choice.size,
      colorImageUrls,
      ...own,
    }),
  };
}

/**
 * Grouping never takes a product off sale: an approved product the model would leave lacking
 * something it had (NCM, a required sheet field) refuses the group, naming that product.
 */
async function lostSaleProblems(
  transaction: DatabaseExecutor,
  input: {
    supplierId: string;
    choices: readonly Choice[];
    values: ProductModelShared;
    grid: ProductGrid;
  },
): Promise<Record<string, string[]>> {
  const approved = input.choices.filter((choice) => choice.row.reviewStatus === "approved");
  if (approved.length === 0) {
    return {};
  }
  // The checks already made every product share the model's category.
  const [fallback, slug] = await Promise.all([
    getSupplierFiscalFallback(transaction, input.supplierId),
    categorySlugOf(transaction, input.values.categoryId),
  ]);
  const byProduct: Record<string, string[]> = {};
  for (const choice of approved) {
    const before = new Set(saleProblems(choice.row, slug, fallback));
    const { modelColumns, product } = rewritten(choice, input.values, input.grid);
    const lost = saleProblems({ ...choice.row, ...modelColumns, ...product }, slug, fallback)
      .filter((problem) => !before.has(problem))
      .map(
        (problem) =>
          `Juntar tiraria este produto de venda (${problem}). Escolha outro produto principal ou complete o principal antes.`,
      );
    if (lost.length > 0) {
      byProduct[choice.row.id] = lost;
    }
  }
  return byProduct;
}

async function lockProducts(
  transaction: DatabaseExecutor,
  input: GroupProductsInput,
): Promise<ProductRow[]> {
  const ids = input.products.map((product) => product.productId);
  // Same row order as sales and imports take their locks in, so none of them deadlock.
  const rows = await transaction
    .select()
    .from(supplierProducts)
    .where(
      and(eq(supplierProducts.supplierId, input.supplierId), inArray(supplierProducts.id, ids)),
    )
    .orderBy(asc(supplierProducts.id))
    .for("no key update");
  if (rows.length !== new Set(ids).size) {
    throw notFoundError("Um dos produtos não está mais neste fornecedor. Recarregue as sugestões.");
  }
  const inGrid = rows.find((row) => row.modelId !== null);
  if (inGrid !== undefined) {
    throw conflictError(
      `O produto ${inGrid.sku} já está numa grade de cores e tamanhos. Recarregue as sugestões.`,
    );
  }
  return rows;
}

function choicesOf(input: GroupProductsInput, rows: readonly ProductRow[]): Choice[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const colors = canonicalNames(input.products.map((product) => product.color));
  const sizes = canonicalNames(input.products.map((product) => product.size));
  return input.products.map((product) => {
    const row = byId.get(product.productId);
    if (row === undefined) {
      throw new Error(`locked product ${product.productId} vanished`);
    }
    return { row, color: canonical(colors, product.color), size: canonical(sizes, product.size) };
  });
}

function checkedProducts(
  choices: readonly Choice[],
  fallback: FiscalFallback | null,
): GroupingProduct[] {
  return choices.map((choice) => ({
    productId: choice.row.id,
    sku: choice.row.sku,
    color: choice.color,
    size: choice.size,
    categoryId: choice.row.categoryId,
    fiscal: sharedFiscalOf(choice.row.fiscal, fallback),
  }));
}

export type GroupProductsResult =
  | { readonly grouped: true; readonly modelId: string; readonly groupingId: string }
  | { readonly grouped: false; readonly problems: GroupingProblems };

async function writeGrouping(
  transaction: DatabaseExecutor,
  input: GroupProductsInput & { groupedBy: string },
  plan: { choices: readonly Choice[]; values: ProductModelShared; grid: ProductGrid },
): Promise<{ modelId: string; groupingId: string }> {
  const { supplierId } = input;
  const { choices, values, grid } = plan;
  const code = await modelCodeFor(transaction, { supplierId, title: values.title });
  const [model] = await transaction
    .insert(productModels)
    .values({ supplierId, code, ...values, imageUrls: [...values.imageUrls] })
    .returning({ id: productModels.id });
  if (model === undefined) {
    throw new Error("product_models insert returned no row");
  }
  await insertOptions(transaction, model.id, grid);
  const [grouping] = await transaction
    .insert(productGroupings)
    .values({ supplierId, modelId: model.id, groupedBy: input.groupedBy })
    .returning({ id: productGroupings.id });
  if (grouping === undefined) {
    throw new Error("product_groupings insert returned no row");
  }
  await transaction.insert(productGroupingItems).values(
    choices.map(({ row }) => ({
      groupingId: grouping.id,
      supplierProductId: row.id,
      title: row.title,
      description: row.description,
      categoryId: row.categoryId,
      imageUrls: row.imageUrls,
      mercadoLivreAttributes: row.mercadoLivreAttributes,
      mercadoLivreCategoryId: row.mercadoLivreCategoryId,
      mercadoLivreCategoryName: row.mercadoLivreCategoryName,
      warrantyType: row.warrantyType,
      warrantyDays: row.warrantyDays,
      videoUrl: row.videoUrl,
      madeToOrderDays: row.madeToOrderDays,
      carrierOnly: row.carrierOnly,
      fiscal: row.fiscal,
    })),
  );
  for (const choice of choices) {
    const { modelColumns, product } = rewritten(choice, values, grid);
    // Only what the grid shares changes: stock, prices, SKU, status and "on sale" stay.
    await transaction
      .update(supplierProducts)
      .set({ ...product, ...modelColumns, modelId: model.id })
      .where(eq(supplierProducts.id, choice.row.id));
  }
  return { modelId: model.id, groupingId: grouping.id };
}

/**
 * Turns products the supplier already has into the combinations of a new model, keeping each
 * product's id, SKU, stock, reservation, prices, status and "on sale": listings and orders point
 * at the same rows and notice nothing. Each product's "before" is kept, so it can be separated.
 *
 * @returns The new model, or the problems to show next to each product (nothing is written).
 * @throws AppError NOT_FOUND when a product is not the supplier's; CONFLICT when one is already
 *   in a grid.
 */
export async function groupProducts(
  database: Database,
  input: GroupProductsInput & { groupedBy: string },
): Promise<GroupProductsResult> {
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, input.supplierId);
    const rows = await lockProducts(transaction, input);
    const choices = choicesOf(input, rows);
    const fallback = await getSupplierFiscalFallback(transaction, input.supplierId);
    const problems = groupingProblems({
      modelTitle: input.modelTitle,
      mainProductId: input.mainProductId,
      products: checkedProducts(choices, fallback),
    });
    if (!canGroup(problems)) {
      return { grouped: false as const, problems };
    }
    const main = choices.find((choice) => choice.row.id === input.mainProductId);
    if (main === undefined) {
      throw new Error("the main product passed the checks but is not among the products");
    }
    const values = modelValues(main.row, input.modelTitle);
    const grid = gridOf(choices);
    const structure = gridStructureProblems(grid);
    if (structure.length > 0) {
      return { grouped: false as const, problems: { general: structure, byProduct: {} } };
    }
    const lost = await lostSaleProblems(transaction, {
      supplierId: input.supplierId,
      choices,
      values,
      grid,
    });
    if (Object.keys(lost).length > 0) {
      return { grouped: false as const, problems: { general: [], byProduct: lost } };
    }
    return {
      grouped: true as const,
      ...(await writeGrouping(transaction, input, { choices, values, grid })),
    };
  });
}

/** When the grid came from grouping existing products (it can then be separated again). */
export async function findModelGrouping(
  executor: DatabaseExecutor,
  ref: { supplierId: string; modelId: string },
) {
  const [grouping] = await executor
    .select({ id: productGroupings.id, createdAt: productGroupings.createdAt })
    .from(productGroupings)
    .where(
      and(
        eq(productGroupings.supplierId, ref.supplierId),
        eq(productGroupings.modelId, ref.modelId),
        isNull(productGroupings.separatedAt),
      ),
    );
  return grouping ?? null;
}

const PLAIN_PRODUCT = {
  modelId: null,
  color: null,
  size: null,
  variantAttributes: {},
  variantFiscal: {},
} as const;

function beforeColumns(item: typeof productGroupingItems.$inferSelect) {
  return {
    title: item.title,
    description: item.description,
    categoryId: item.categoryId,
    imageUrls: item.imageUrls,
    mercadoLivreAttributes: item.mercadoLivreAttributes,
    mercadoLivreCategoryId: item.mercadoLivreCategoryId,
    mercadoLivreCategoryName: item.mercadoLivreCategoryName,
    warrantyType: item.warrantyType,
    warrantyDays: item.warrantyDays,
    videoUrl: item.videoUrl,
    madeToOrderDays: item.madeToOrderDays,
    carrierOnly: item.carrierOnly,
    fiscal: item.fiscal,
  };
}

/**
 * A grid a reseller publishes as one listing cannot be split: its items share one family on
 * the marketplace. The model row is locked first, so a publication starting now waits.
 */
async function assertNotSoldAsGrid(transaction: DatabaseExecutor, modelId: string): Promise<void> {
  await transaction
    .select({ id: productModels.id })
    .from(productModels)
    .where(eq(productModels.id, modelId))
    .for("update");
  if (await modelHasListingFamily(transaction, modelId)) {
    throw conflictError(
      "Revendedores já anunciam este produto como uma grade só, então ele não pode mais ser separado.",
    );
  }
}

/**
 * Turns a grouped grid back into plain products: each grouped product gets its "before" back
 * (name, description, photos, sheet, fiscal, category, sale terms); stock, cost and price stay as
 * they are now. A combination added after grouping becomes a plain product with the grid's name.
 * The model is deleted; the grouping record stays as the trail. Listings and orders notice
 * nothing: no product id changes. Status and "on sale" stay as they are.
 *
 * @throws AppError NOT_FOUND when the model is not the supplier's; VALIDATION when it did not
 *   come from grouping products; CONFLICT when a reseller already sells it as one grid listing.
 */
export async function separateGroupedModel(
  database: Database,
  input: { supplierId: string; modelId: string; separatedBy: string },
): Promise<{ productIds: string[] }> {
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, input.supplierId);
    const model = await getProductModel(transaction, input);
    if (model === null) {
      throw notFoundError("Produto não encontrado neste fornecedor");
    }
    const grouping = await findModelGrouping(transaction, input);
    if (grouping === null) {
      throw validationError(
        "Só dá para separar uma grade feita pela tela Juntar cores e tamanhos.",
      );
    }
    await assertNotSoldAsGrid(transaction, input.modelId);
    const combinations = await transaction
      .select({ id: supplierProducts.id })
      .from(supplierProducts)
      .where(eq(supplierProducts.modelId, input.modelId))
      .orderBy(asc(supplierProducts.id))
      .for("no key update");
    const befores = await transaction
      .select()
      .from(productGroupingItems)
      .where(eq(productGroupingItems.groupingId, grouping.id));
    const beforeOf = new Map(befores.map((item) => [item.supplierProductId, item]));
    for (const { id } of combinations) {
      const before = beforeOf.get(id);
      await transaction
        .update(supplierProducts)
        .set({ ...(before === undefined ? {} : beforeColumns(before)), ...PLAIN_PRODUCT })
        .where(eq(supplierProducts.id, id));
    }
    await transaction
      .update(productGroupings)
      .set({ separatedAt: new Date(), separatedBy: input.separatedBy })
      .where(eq(productGroupings.id, grouping.id));
    await transaction.delete(productModels).where(eq(productModels.id, input.modelId));
    return { productIds: combinations.map((combination) => combination.id) };
  });
}
