import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  combinationOwnFields,
  materializeCombination,
  modelCodeFromTitle,
  type GridColor,
  type GridCombination,
  type MaterializedCombination,
  type ProductGrid,
  type ProductModelShared,
} from "@sellbridge/shared/product-grid";
import {
  hasRequiredFiscalData,
  readProductFiscal,
  withFiscalFallback,
  type FiscalFallback,
} from "@sellbridge/shared/product-fiscal";
import { and, asc, eq, inArray, like, or } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  productModelColors,
  productModels,
  productModelSizes,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { getSupplierFiscalFallback } from "./supplier-brand.ts";

/** A model as the grid form edits it: shared data, colours and sizes in order, combinations. */
export interface ProductModelDetail {
  readonly id: string;
  readonly supplierId: string;
  /** The supplier's code for the model, as the spreadsheet carries it. */
  readonly code: string;
  readonly updatedAt: Date;
  readonly values: ProductModelShared;
  readonly colors: readonly { name: string; imageUrls: string[] }[];
  readonly sizes: readonly string[];
  readonly combinations: readonly ProductModelCombination[];
}

export interface ProductModelCombination {
  readonly id: string;
  readonly color: string | null;
  readonly size: string | null;
  readonly sku: string;
  readonly gtin: string | null;
  readonly netWeightGrams: number | null;
  readonly stock: number;
  readonly reservedStock: number;
  readonly costCents: number;
  readonly suggestedPriceCents: number;
  readonly active: boolean;
  readonly reviewStatus: string;
}

/** Same lock as the team's product writes, so a grid save never races an import or an edit. */
export async function lockSupplier(database: DatabaseExecutor, supplierId: string): Promise<void> {
  const [supplier] = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .for("update");
  if (supplier === undefined) {
    throw notFoundError("Fornecedor não encontrado");
  }
}

async function assertSkusAreFree(
  database: DatabaseExecutor,
  supplierId: string,
  skus: readonly string[],
): Promise<void> {
  const taken = await database
    .select({ sku: supplierProducts.sku })
    .from(supplierProducts)
    .where(
      and(eq(supplierProducts.supplierId, supplierId), inArray(supplierProducts.sku, [...skus])),
    )
    .orderBy(asc(supplierProducts.sku));
  if (taken.length > 0) {
    throw conflictError(
      `Já existe produto com ${taken.length === 1 ? "o SKU" : "os SKUs"} ${taken.map((row) => row.sku).join(", ")} neste fornecedor`,
    );
  }
}

/**
 * The code a new model takes: the one given, when free (a spreadsheet's code is the supplier's
 * own, never renamed), or the title's with "-2", "-3"… until it is free.
 *
 * @throws AppError CONFLICT when a given code already belongs to another model of the supplier.
 */
export async function modelCodeFor(
  transaction: DatabaseExecutor,
  input: { supplierId: string; code?: string | undefined; title: string },
): Promise<string> {
  const base = input.code ?? modelCodeFromTitle(input.title);
  const taken = new Set(
    (
      await transaction
        .select({ code: productModels.code })
        .from(productModels)
        .where(
          and(
            eq(productModels.supplierId, input.supplierId),
            or(eq(productModels.code, base), like(productModels.code, `${base}-%`)),
          ),
        )
    ).map((row) => row.code),
  );
  if (input.code !== undefined && taken.has(base)) {
    throw conflictError(`Já existe um modelo com o código "${base}" neste fornecedor`);
  }
  if (!taken.has(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** NF-e data as the rules read it: origin and unit from Marca fill the product's empty ones. */
function hasFiscalData(fiscal: unknown, fallback: FiscalFallback | null): boolean {
  return hasRequiredFiscalData(withFiscalFallback(readProductFiscal(fiscal), fallback));
}

/**
 * A combination goes on sale only with its NF-e data and a known cost, as a single product does:
 * a cost of zero means "not filled in", never a free product.
 */
function reviewStatusFor(
  requested: "approved" | "draft",
  product: MaterializedCombination & { costCents: number },
  fallback: FiscalFallback | null,
): "approved" | "draft" {
  if (requested === "draft" || product.costCents <= 0) {
    return "draft";
  }
  return hasFiscalData(product.fiscal, fallback) ? "approved" : "draft";
}

function colorPhotos(grid: ProductGrid): ReadonlyMap<string, string[]> {
  return new Map(grid.colors.map((color) => [color.name, color.imageUrls]));
}

export function combinationRow(
  model: {
    supplierId: string;
    modelId: string;
    values: ProductModelShared;
    photos: ReadonlyMap<string, string[]>;
  },
  combination: GridCombination,
) {
  const { supplierId, modelId, values, photos } = model;
  const own = combinationOwnFields(combination);
  const product = materializeCombination(values, {
    color: combination.color,
    size: combination.size,
    colorImageUrls: combination.color === null ? [] : (photos.get(combination.color) ?? []),
    ...own,
  });
  return {
    supplierId,
    modelId,
    color: combination.color,
    size: combination.size,
    ...own,
    ...product,
    sku: combination.sku,
    costCents: combination.costCents,
    suggestedPriceCents: combination.suggestedPriceCents,
    stock: combination.stock,
    fiscalRequired: true,
  };
}

/**
 * Creates a model and one product per combination, all in one transaction.
 *
 * @param input.grid - Already validated with `productGridSchema`.
 * @param input.reviewStatus - "approved" from the team, "draft" from the supplier panel; a
 *   combination without NCM, origin and unit is saved as a draft either way.
 * @throws AppError CONFLICT when a combination's SKU already exists for the supplier.
 */
export async function createProductModel(
  database: Database,
  input: {
    supplierId: string;
    /** The spreadsheet's "codigo_modelo"; left out, the code comes from the title. */
    code?: string | undefined;
    values: ProductModelShared;
    grid: ProductGrid;
    reviewStatus: "approved" | "draft";
  },
): Promise<{ modelId: string; combinationIds: string[] }> {
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, input.supplierId);
    return await insertProductModel(transaction, input);
  });
}

/** `createProductModel` inside a transaction the caller holds, with the supplier locked. */
export async function insertProductModel(
  transaction: DatabaseExecutor,
  input: Parameters<typeof createProductModel>[1],
): Promise<{ modelId: string; combinationIds: string[] }> {
  const { supplierId, values, grid } = input;
  const code = await modelCodeFor(transaction, {
    supplierId,
    code: input.code,
    title: values.title,
  });
  await assertSkusAreFree(
    transaction,
    supplierId,
    grid.combinations.map((combination) => combination.sku),
  );
  const [model] = await transaction
    .insert(productModels)
    .values({ supplierId, code, ...values, imageUrls: [...values.imageUrls] })
    .returning({ id: productModels.id });
  if (model === undefined) {
    throw new Error("product_models insert returned no row");
  }
  await insertOptions(transaction, model.id, grid);
  const fallback = await getSupplierFiscalFallback(transaction, supplierId);
  const photos = colorPhotos(grid);
  const rows = grid.combinations.map((combination) => {
    const row = combinationRow({ supplierId, modelId: model.id, values, photos }, combination);
    return { ...row, reviewStatus: reviewStatusFor(input.reviewStatus, row, fallback) };
  });
  const inserted = await transaction
    .insert(supplierProducts)
    .values(rows)
    .returning({ id: supplierProducts.id });
  return { modelId: model.id, combinationIds: inserted.map((row) => row.id) };
}

/**
 * Adds colours, sizes and combinations to a grid the supplier has, each combination built from
 * the model's stored shared data. The caller holds the supplier lock.
 *
 * @throws AppError NOT_FOUND when the model is not the supplier's; CONFLICT when a SKU is taken.
 */
export async function addCombinationsToModel(
  transaction: DatabaseExecutor,
  input: {
    supplierId: string;
    modelId: string;
    colors: readonly GridColor[];
    sizes: readonly string[];
    combinations: readonly GridCombination[];
  },
): Promise<string[]> {
  const { supplierId, modelId } = input;
  await assertSkusAreFree(
    transaction,
    supplierId,
    input.combinations.map((combination) => combination.sku),
  );
  const [model] = await transaction
    .select()
    .from(productModels)
    .where(and(eq(productModels.id, modelId), eq(productModels.supplierId, supplierId)));
  if (model === undefined) {
    throw notFoundError("Modelo não encontrado neste fornecedor");
  }
  const storedColors = await transaction
    .select({ name: productModelColors.name, imageUrls: productModelColors.imageUrls })
    .from(productModelColors)
    .where(eq(productModelColors.modelId, modelId));
  const storedSizes = await transaction
    .select({ name: productModelSizes.name })
    .from(productModelSizes)
    .where(eq(productModelSizes.modelId, modelId));
  await appendOptions(transaction, modelId, {
    colors: input.colors.map((color, index) => ({
      ...color,
      position: storedColors.length + index,
    })),
    sizes: input.sizes.map((name, index) => ({ name, position: storedSizes.length + index })),
  });
  const photos = new Map(
    [...storedColors, ...input.colors].map((color) => [color.name, [...color.imageUrls]]),
  );
  const values = sharedValues(model);
  const fallback = await getSupplierFiscalFallback(transaction, supplierId);
  if (input.combinations.length === 0) {
    return [];
  }
  const rows = input.combinations.map((combination) => {
    const row = combinationRow({ supplierId, modelId, values, photos }, combination);
    return { ...row, reviewStatus: reviewStatusFor("approved", row, fallback) };
  });
  const inserted = await transaction
    .insert(supplierProducts)
    .values(rows)
    .returning({ id: supplierProducts.id });
  return inserted.map((row) => row.id);
}

async function appendOptions(
  transaction: DatabaseExecutor,
  modelId: string,
  options: {
    colors: readonly { name: string; imageUrls: readonly string[]; position: number }[];
    sizes: readonly { name: string; position: number }[];
  },
): Promise<void> {
  if (options.colors.length > 0) {
    await transaction.insert(productModelColors).values(
      options.colors.map((color) => ({
        modelId,
        name: color.name,
        position: color.position,
        imageUrls: [...color.imageUrls],
      })),
    );
  }
  if (options.sizes.length > 0) {
    await transaction
      .insert(productModelSizes)
      .values(options.sizes.map((size) => ({ modelId, name: size.name, position: size.position })));
  }
}

async function insertOptions(
  transaction: DatabaseExecutor,
  modelId: string,
  grid: ProductGrid,
): Promise<void> {
  if (grid.colors.length > 0) {
    await transaction.insert(productModelColors).values(
      grid.colors.map((color, position) => ({
        modelId,
        name: color.name,
        position,
        imageUrls: color.imageUrls,
      })),
    );
  }
  if (grid.sizes.length > 0) {
    await transaction
      .insert(productModelSizes)
      .values(grid.sizes.map((name, position) => ({ modelId, name, position })));
  }
}

/**
 * Saves the model's shared data and rewrites every combination from it, so no combination keeps
 * an old title, photo or attribute. Stock, prices, SKUs and review status are left as they are.
 *
 * @throws AppError NOT_FOUND when the model does not belong to the supplier.
 */
export async function updateProductModel(
  database: Database,
  input: { supplierId: string; modelId: string; values: ProductModelShared },
): Promise<void> {
  const { supplierId, modelId, values } = input;
  await database.transaction(async (transaction) => {
    await lockSupplier(transaction, supplierId);
    const [model] = await transaction
      .update(productModels)
      .set({ ...values, imageUrls: [...values.imageUrls] })
      .where(and(eq(productModels.id, modelId), eq(productModels.supplierId, supplierId)))
      .returning({ id: productModels.id });
    if (model === undefined) {
      throw notFoundError("Modelo não encontrado neste fornecedor");
    }
    await rewriteCombinations(transaction, modelId, values);
  });
}

export async function rewriteCombinations(
  transaction: DatabaseExecutor,
  modelId: string,
  values: ProductModelShared,
): Promise<void> {
  const colors = await transaction
    .select({ name: productModelColors.name, imageUrls: productModelColors.imageUrls })
    .from(productModelColors)
    .where(eq(productModelColors.modelId, modelId));
  const photos = new Map(colors.map((color) => [color.name, color.imageUrls]));
  const fallback = await fiscalFallbackOfModel(transaction, modelId);
  // Same row order as sales and imports take their locks in, so none of them deadlock.
  const combinations = await transaction
    .select({
      id: supplierProducts.id,
      color: supplierProducts.color,
      size: supplierProducts.size,
      variantAttributes: supplierProducts.variantAttributes,
      variantFiscal: supplierProducts.variantFiscal,
      reviewStatus: supplierProducts.reviewStatus,
      fiscalRequired: supplierProducts.fiscalRequired,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.modelId, modelId))
    .orderBy(asc(supplierProducts.id))
    .for("no key update");
  for (const combination of combinations) {
    const product = materializeCombination(values, {
      ...combination,
      colorImageUrls: combination.color === null ? [] : (photos.get(combination.color) ?? []),
    });
    // Erasing the model's NCM, origin or unit takes its combinations off sale, as it does a
    // single product created under the NF-e rule.
    const losesFiscal =
      combination.reviewStatus === "approved" &&
      combination.fiscalRequired &&
      !hasFiscalData(product.fiscal, fallback);
    await transaction
      .update(supplierProducts)
      .set({ ...product, ...(losesFiscal ? { reviewStatus: "draft" as const } : {}) })
      .where(eq(supplierProducts.id, combination.id));
  }
}

async function fiscalFallbackOfModel(
  transaction: DatabaseExecutor,
  modelId: string,
): Promise<FiscalFallback | null> {
  const [model] = await transaction
    .select({ supplierId: productModels.supplierId })
    .from(productModels)
    .where(eq(productModels.id, modelId));
  if (model === undefined) {
    throw new Error(`product model ${modelId} vanished while its combinations were rewritten`);
  }
  return await getSupplierFiscalFallback(transaction, model.supplierId);
}

/** The model with its options in order and its combinations; null when not the supplier's. */
export async function getProductModel(
  database: DatabaseExecutor,
  input: { supplierId: string; modelId: string },
): Promise<ProductModelDetail | null> {
  const [model] = await database
    .select()
    .from(productModels)
    .where(
      and(eq(productModels.id, input.modelId), eq(productModels.supplierId, input.supplierId)),
    );
  if (model === undefined) {
    return null;
  }
  const [colors, sizes, combinations] = await Promise.all([
    database
      .select({ name: productModelColors.name, imageUrls: productModelColors.imageUrls })
      .from(productModelColors)
      .where(eq(productModelColors.modelId, model.id))
      .orderBy(asc(productModelColors.position)),
    database
      .select({ name: productModelSizes.name })
      .from(productModelSizes)
      .where(eq(productModelSizes.modelId, model.id))
      .orderBy(asc(productModelSizes.position)),
    database
      .select({
        id: supplierProducts.id,
        color: supplierProducts.color,
        size: supplierProducts.size,
        sku: supplierProducts.sku,
        variantAttributes: supplierProducts.variantAttributes,
        variantFiscal: supplierProducts.variantFiscal,
        stock: supplierProducts.stock,
        reservedStock: supplierProducts.reservedStock,
        costCents: supplierProducts.costCents,
        suggestedPriceCents: supplierProducts.suggestedPriceCents,
        active: supplierProducts.active,
        reviewStatus: supplierProducts.reviewStatus,
      })
      .from(supplierProducts)
      .where(eq(supplierProducts.modelId, model.id)),
  ]);
  const sizeNames = sizes.map((size) => size.name);
  return {
    id: model.id,
    supplierId: model.supplierId,
    code: model.code,
    updatedAt: model.updatedAt,
    values: sharedValues(model),
    colors,
    sizes: sizeNames,
    combinations: inGridOrder(
      combinations.map(withOwnValues),
      colors.map((color) => color.name),
      sizeNames,
    ),
  };
}

function withOwnValues(row: {
  id: string;
  color: string | null;
  size: string | null;
  sku: string;
  variantAttributes: Readonly<Record<string, string>>;
  variantFiscal: { netWeightGrams?: number | null | undefined };
  stock: number;
  reservedStock: number;
  costCents: number;
  suggestedPriceCents: number;
  active: boolean;
  reviewStatus: string;
}): ProductModelCombination {
  const { variantAttributes, variantFiscal, ...rest } = row;
  return {
    ...rest,
    gtin: variantAttributes.GTIN ?? null,
    netWeightGrams: variantFiscal.netWeightGrams ?? null,
  };
}

function sharedValues(model: typeof productModels.$inferSelect): ProductModelShared {
  return {
    title: model.title,
    description: model.description,
    categoryId: model.categoryId,
    imageUrls: model.imageUrls,
    mercadoLivreAttributes: model.mercadoLivreAttributes,
    mercadoLivreCategoryId: model.mercadoLivreCategoryId,
    mercadoLivreCategoryName: model.mercadoLivreCategoryName,
    warrantyType: model.warrantyType,
    warrantyDays: model.warrantyDays,
    videoUrl: model.videoUrl,
    madeToOrderDays: model.madeToOrderDays,
    carrierOnly: model.carrierOnly,
    fiscal: model.fiscal,
  };
}

function gridPosition(order: readonly string[], name: string | null): number {
  return name === null ? 0 : order.indexOf(name);
}

/** Colour by colour, each in size order: the order the grid form and the buyer see. */
function inGridOrder<Row extends { color: string | null; size: string | null }>(
  rows: readonly Row[],
  colorOrder: readonly string[],
  sizeOrder: readonly string[],
): Row[] {
  return rows.toSorted(
    (first, second) =>
      gridPosition(colorOrder, first.color) - gridPosition(colorOrder, second.color) ||
      gridPosition(sizeOrder, first.size) - gridPosition(sizeOrder, second.size),
  );
}
