import type { ProductCsvError, ProductCsvRow } from "@sellbridge/shared/product-csv";
import type {
  GridColor,
  GridCombination,
  ProductModelShared,
} from "@sellbridge/shared/product-grid";
import {
  gridPairKey,
  type ExistingImportModel,
  type ExistingImportSku,
  type GridImportGroup,
} from "@sellbridge/shared/product-grid-import";
import { defaultSuggestedPriceCents } from "@sellbridge/shared/schemas";
import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import {
  productModelColors,
  productModels,
  productModelSizes,
  supplierProducts,
} from "../schema/index.ts";
import { demoteUnsellableCombinations } from "./product-model-drafts.ts";
import { addCombinationsToModel, insertProductModel } from "./product-models.ts";

/** A grid the import creates (`modelId` null) or grows, resolved to what the database writes. */
export interface PlannedGrid {
  readonly modelCode: string;
  readonly modelId: string | null;
  readonly values: ProductModelShared;
  readonly colors: readonly GridColor[];
  readonly sizes: readonly string[];
  readonly combinations: readonly GridCombination[];
  /** Combinations the file sends with "ativo" = não. */
  readonly offSaleSkus: readonly string[];
}

async function existingSkusOf(
  database: DatabaseExecutor,
  supplierId: string,
  skus: readonly string[],
): Promise<Map<string, ExistingImportSku>> {
  if (skus.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      sku: supplierProducts.sku,
      modelId: supplierProducts.modelId,
      modelCode: productModels.code,
      color: supplierProducts.color,
      size: supplierProducts.size,
    })
    .from(supplierProducts)
    .leftJoin(productModels, eq(productModels.id, supplierProducts.modelId))
    .where(
      and(eq(supplierProducts.supplierId, supplierId), inArray(supplierProducts.sku, [...skus])),
    );
  return new Map(rows.map(({ sku, ...existing }) => [sku, existing]));
}

async function existingModelsOf(
  database: DatabaseExecutor,
  supplierId: string,
  codes: readonly string[],
): Promise<Map<string, ExistingImportModel>> {
  if (codes.length === 0) {
    return new Map();
  }
  const models = await database
    .select({ id: productModels.id, code: productModels.code })
    .from(productModels)
    .where(and(eq(productModels.supplierId, supplierId), inArray(productModels.code, [...codes])));
  const ids = models.map((model) => model.id);
  if (ids.length === 0) {
    return new Map();
  }
  const [colors, sizes, combinations] = await Promise.all([
    database
      .select({ modelId: productModelColors.modelId, name: productModelColors.name })
      .from(productModelColors)
      .where(inArray(productModelColors.modelId, ids)),
    database
      .select({ modelId: productModelSizes.modelId, name: productModelSizes.name })
      .from(productModelSizes)
      .where(inArray(productModelSizes.modelId, ids)),
    database
      .select({
        modelId: supplierProducts.modelId,
        color: supplierProducts.color,
        size: supplierProducts.size,
      })
      .from(supplierProducts)
      .where(inArray(supplierProducts.modelId, ids)),
  ]);
  return new Map(
    models.map((model) => [
      model.code,
      {
        ...model,
        colors: colors.filter((color) => color.modelId === model.id).map((color) => color.name),
        sizes: sizes.filter((size) => size.modelId === model.id).map((size) => size.name),
        pairs: new Set(
          combinations
            .filter((combination) => combination.modelId === model.id)
            .map((combination) => gridPairKey(combination.color, combination.size)),
        ),
      },
    ]),
  );
}

/** What `planGridImport` needs to know about the supplier's products and grids. */
export async function loadGridImportContext(
  database: DatabaseExecutor,
  supplierId: string,
  rows: readonly ProductCsvRow[],
) {
  const gridRows = rows.filter((row) => row.product.grid !== undefined);
  const codes = [...new Set(gridRows.map((row) => row.product.grid?.modelCode ?? ""))];
  const [existingSkus, existingModels] = await Promise.all([
    existingSkusOf(
      database,
      supplierId,
      gridRows.map((row) => row.product.sku),
    ),
    existingModelsOf(database, supplierId, codes),
  ]);
  return { existingSkus, existingModels };
}

function modelValues(
  first: GridImportGroup["first"],
  categoryId: string | null,
): ProductModelShared {
  const { GTIN: _barcode, ...attributes } = first.mercadoLivreAttributes ?? {};
  const { netWeightGrams: _weight, ...fiscal } = first.fiscal ?? {};
  return {
    title: first.title,
    description: first.description,
    categoryId,
    imageUrls: first.imageUrls,
    mercadoLivreAttributes: attributes,
    mercadoLivreCategoryId: null,
    mercadoLivreCategoryName: null,
    warrantyType: null,
    warrantyDays: null,
    videoUrl: null,
    madeToOrderDays: null,
    carrierOnly: false,
    fiscal,
  };
}

/**
 * The grids of the plan with their category resolved; a new grid whose category is unknown is
 * an error on its first line, as a product of its own would be.
 */
export function resolveGrids(
  groups: readonly GridImportGroup[],
  categoryIdOf: (slug: string) => string | undefined,
): { grids: PlannedGrid[]; errors: ProductCsvError[] } {
  const grids: PlannedGrid[] = [];
  const errors: ProductCsvError[] = [];
  for (const group of groups) {
    const slug = group.first.categorySlug;
    const categoryId = slug === null ? null : categoryIdOf(slug);
    const firstLine = group.combinations[0]?.line ?? 0;
    if (group.modelId === null && categoryId === undefined) {
      errors.push({ line: firstLine, reason: `Categoria desconhecida: ${slug ?? ""}` });
      continue;
    }
    grids.push({
      modelCode: group.modelCode,
      modelId: group.modelId,
      values: modelValues(group.first, categoryId ?? null),
      colors: group.colors.map((color) => ({ name: color.name, imageUrls: [...color.imageUrls] })),
      sizes: group.sizes,
      combinations: group.combinations.map(({ product, color, size }) => ({
        color,
        size,
        sku: product.sku,
        gtin: product.mercadoLivreAttributes?.GTIN ?? null,
        costCents: product.costCents,
        suggestedPriceCents:
          product.suggestedPriceCents ?? defaultSuggestedPriceCents(product.costCents),
        stock: product.stock,
        netWeightGrams: product.fiscal?.netWeightGrams ?? null,
      })),
      offSaleSkus: group.combinations
        .filter((combination) => combination.product.active === false)
        .map((combination) => combination.product.sku),
    });
  }
  return { grids, errors };
}

async function categoryOfModel(
  transaction: DatabaseExecutor,
  modelId: string,
): Promise<string | null> {
  const [model] = await transaction
    .select({ categoryId: productModels.categoryId })
    .from(productModels)
    .where(eq(productModels.id, modelId));
  return model?.categoryId ?? null;
}

async function writeGrid(
  transaction: DatabaseExecutor,
  supplierId: string,
  grid: PlannedGrid,
): Promise<{ modelId: string; combinationIds: string[] }> {
  const combinations = [...grid.combinations];
  if (grid.modelId === null) {
    return await insertProductModel(transaction, {
      supplierId,
      code: grid.modelCode,
      values: grid.values,
      grid: { colors: [...grid.colors], sizes: [...grid.sizes], combinations },
      reviewStatus: "approved",
    });
  }
  const combinationIds = await addCombinationsToModel(transaction, {
    supplierId,
    modelId: grid.modelId,
    colors: grid.colors,
    sizes: grid.sizes,
    combinations,
  });
  return { modelId: grid.modelId, combinationIds };
}

/**
 * Writes the plan's grids inside the import's transaction (the supplier is locked). Each
 * combination goes on sale when it can be sold, as a single product from the import does.
 */
export async function writePlannedGrids(
  transaction: DatabaseExecutor,
  supplierId: string,
  grids: readonly PlannedGrid[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const grid of grids) {
    const written = await writeGrid(transaction, supplierId, grid);
    ids.push(...written.combinationIds);
    const { modelId } = written;
    if (grid.offSaleSkus.length > 0) {
      await transaction
        .update(supplierProducts)
        .set({ active: false })
        .where(
          and(
            eq(supplierProducts.supplierId, supplierId),
            inArray(supplierProducts.sku, [...grid.offSaleSkus]),
          ),
        );
    }
    await demoteUnsellableCombinations(transaction, {
      supplierId,
      modelId,
      categoryId: await categoryOfModel(transaction, modelId),
    });
  }
  return ids;
}
