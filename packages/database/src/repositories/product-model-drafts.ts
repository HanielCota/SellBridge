import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import {
  combinationLabel,
  combinationOwnFields,
  gridOfDraft,
  gridProblems,
  type ProductGridDraft,
} from "@sellbridge/shared/product-grid";
import {
  icmsOverrideProblem,
  readProductFiscal,
  withFiscalFallback,
  type FiscalFallback,
} from "@sellbridge/shared/product-fiscal";
import { firstTextWithContact, SUPPLIER_TEXT_CONTACT_REFUSED } from "@sellbridge/shared/schemas";
import {
  evaluateCompleteness,
  isProhibitedProduct,
  requiredAttributesFor,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import type {
  CatalogModelRef,
  CatalogSaveModelDraftInput,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { readSupplierFiscalProfile } from "@sellbridge/shared/supplier-fiscal";
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  categories,
  productModelColors,
  productModels,
  productModelSizes,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import {
  combinationRow,
  getProductModel,
  lockSupplier,
  modelCodeFor,
  rewriteCombinations,
  type ProductModelDetail,
} from "./product-models.ts";
import { getSupplierFiscalFallback } from "./supplier-brand.ts";
import { neverListedNorSold } from "./supplier-panel-catalog.ts";

const MODEL_CHANGED_MESSAGE =
  "Este produto mudou em outra janela, recarregue a página para continuar de onde ela parou.";
const STOCK_MOVED_MESSAGE =
  "O estoque mudou depois que você abriu o produto, recarregue para conferir.";
const MAX_PUBLISH_PROBLEMS_SHOWN = 5;

type GridDraftCombination = ProductGridDraft["combinations"][number];

interface StoredCombination {
  readonly id: string;
  readonly color: string | null;
  readonly size: string | null;
  readonly stock: number;
  readonly sold: boolean;
}

function pairKey(color: string | null, size: string | null): string {
  return `${color ?? ""}\u0000${size ?? ""}`;
}

async function assertIcmsFitsRegime(
  transaction: DatabaseExecutor,
  input: CatalogSaveModelDraftInput,
): Promise<void> {
  const [supplier] = await transaction
    .select({ fiscalProfile: suppliers.fiscalProfile })
    .from(suppliers)
    .where(eq(suppliers.id, input.supplierId));
  const regime = readSupplierFiscalProfile(supplier?.fiscalProfile)?.regime ?? null;
  const problem = icmsOverrideProblem(input.values.fiscal.icmsCode, regime);
  if (problem !== null) {
    throw validationError(problem);
  }
}

/**
 * Creates the model under the id the form generated, or updates it when the form saw its latest
 * version. A retried save that finds its own values already stored is not a conflict.
 */
async function writeModel(
  transaction: DatabaseExecutor,
  input: CatalogSaveModelDraftInput,
): Promise<void> {
  const values = { ...input.values, imageUrls: [...input.values.imageUrls] };
  const code = await modelCodeFor(transaction, {
    supplierId: input.supplierId,
    title: input.values.title,
  });
  const created = await transaction
    .insert(productModels)
    .values({ id: input.modelId, supplierId: input.supplierId, code, ...values })
    .onConflictDoNothing({ target: productModels.id })
    .returning({ id: productModels.id });
  if (created.length > 0) {
    return;
  }
  const [stored] = await transaction
    .select({ supplierId: productModels.supplierId, updatedAt: productModels.updatedAt })
    .from(productModels)
    .where(eq(productModels.id, input.modelId))
    .for("update");
  if (stored === undefined || stored.supplierId !== input.supplierId) {
    // The id exists under another supplier: never reveal or touch it.
    throw notFoundError("Produto não encontrado neste fornecedor");
  }
  const sameVersion =
    input.expectedUpdatedAt !== undefined &&
    Date.parse(input.expectedUpdatedAt) === stored.updatedAt.getTime();
  if (!sameVersion && !(await matchesStoredModel(transaction, input))) {
    throw conflictError(MODEL_CHANGED_MESSAGE);
  }
  await transaction.update(productModels).set(values).where(eq(productModels.id, input.modelId));
}

/** True when the stored model already holds exactly what the form sends (a retried save). */
async function matchesStoredModel(
  transaction: DatabaseExecutor,
  input: CatalogSaveModelDraftInput,
): Promise<boolean> {
  const stored = await getProductModel(transaction, input);
  if (stored === null) {
    return false;
  }
  const sent = gridOfDraft(input.grid);
  const storedGrid = {
    colors: stored.colors,
    sizes: stored.sizes,
    combinations: stored.combinations
      .filter((combination) => combination.active)
      .map((combination) => ({
        color: combination.color,
        size: combination.size,
        sku: combination.sku,
        gtin: combination.gtin,
        costCents: combination.costCents,
        suggestedPriceCents: combination.suggestedPriceCents,
        stock: combination.stock,
        netWeightGrams: combination.netWeightGrams,
      })),
  };
  return (
    stableJson(stored.values) === stableJson(input.values) &&
    stableJson(storedGrid) === stableJson(sent)
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
      return inner;
    }
    return Object.fromEntries(
      Object.entries(inner)
        .filter(([, entry]) => entry !== undefined)
        .toSorted(([first], [second]) => first.localeCompare(second)),
    );
  });
}

/** Renames first, so combinations follow their colour or size (the keys cascade). */
async function applyRenames(
  transaction: DatabaseExecutor,
  modelId: string,
  grid: ProductGridDraft,
): Promise<void> {
  for (const color of grid.colors) {
    if (color.previousName === undefined || color.previousName === color.name) {
      continue;
    }
    await transaction
      .update(productModelColors)
      .set({ name: color.name })
      .where(
        and(
          eq(productModelColors.modelId, modelId),
          eq(productModelColors.name, color.previousName),
        ),
      );
  }
  for (const size of grid.sizes) {
    if (size.previousName === undefined || size.previousName === size.name) {
      continue;
    }
    await transaction
      .update(productModelSizes)
      .set({ name: size.name })
      .where(
        and(eq(productModelSizes.modelId, modelId), eq(productModelSizes.name, size.previousName)),
      );
  }
}

/** The model's combinations, locked in the order sales and imports lock products. */
async function lockStoredCombinations(
  transaction: DatabaseExecutor,
  modelId: string,
): Promise<StoredCombination[]> {
  return await transaction
    .select({
      id: supplierProducts.id,
      color: supplierProducts.color,
      size: supplierProducts.size,
      stock: supplierProducts.stock,
      sold: sql<boolean>`not (${neverListedNorSold})`,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.modelId, modelId))
    .orderBy(asc(supplierProducts.id))
    .for("no key update");
}

/**
 * A combination the supplier took out of the grid is deleted when nobody ever listed or sold it;
 * otherwise it only goes off sale, and its colour and size must stay in the grid.
 */
async function removeLeavingCombinations(
  transaction: DatabaseExecutor,
  grid: ProductGridDraft,
  stored: readonly StoredCombination[],
): Promise<void> {
  const wanted = new Set(grid.combinations.map((entry) => pairKey(entry.color, entry.size)));
  const colors = new Set(grid.colors.map((color) => color.name));
  const sizes = new Set(grid.sizes.map((size) => size.name));
  const leaving = stored.filter((entry) => !wanted.has(pairKey(entry.color, entry.size)));
  for (const combination of leaving.filter((entry) => entry.sold)) {
    const keepsOptions =
      (combination.color === null || colors.has(combination.color)) &&
      (combination.size === null || sizes.has(combination.size));
    if (!keepsOptions) {
      throw validationError(
        `A combinação ${combinationLabel(combination.color, combination.size)} já foi anunciada ou vendida: mantenha a cor e o tamanho dela na grade.`,
      );
    }
  }
  const unsold = leaving.filter((entry) => !entry.sold).map((entry) => entry.id);
  const sold = leaving.filter((entry) => entry.sold).map((entry) => entry.id);
  if (unsold.length > 0) {
    await transaction.delete(supplierProducts).where(inArray(supplierProducts.id, unsold));
  }
  if (sold.length > 0) {
    await transaction
      .update(supplierProducts)
      .set({ active: false })
      .where(inArray(supplierProducts.id, sold));
  }
}

async function writeOptions(
  transaction: DatabaseExecutor,
  modelId: string,
  grid: ProductGridDraft,
): Promise<void> {
  const colorNames = grid.colors.map((color) => color.name);
  const sizeNames = grid.sizes.map((size) => size.name);
  await transaction
    .delete(productModelColors)
    .where(
      and(
        eq(productModelColors.modelId, modelId),
        colorNames.length === 0 ? undefined : notInArray(productModelColors.name, colorNames),
      ),
    );
  await transaction
    .delete(productModelSizes)
    .where(
      and(
        eq(productModelSizes.modelId, modelId),
        sizeNames.length === 0 ? undefined : notInArray(productModelSizes.name, sizeNames),
      ),
    );
  for (const [position, color] of grid.colors.entries()) {
    await transaction
      .insert(productModelColors)
      .values({ modelId, name: color.name, position, imageUrls: [...color.imageUrls] })
      .onConflictDoUpdate({
        target: [productModelColors.modelId, productModelColors.name],
        set: { position, imageUrls: [...color.imageUrls] },
      });
  }
  for (const [position, size] of grid.sizes.entries()) {
    await transaction
      .insert(productModelSizes)
      .values({ modelId, name: size.name, position })
      .onConflictDoUpdate({
        target: [productModelSizes.modelId, productModelSizes.name],
        set: { position },
      });
  }
}

/**
 * The SKUs of a grid save that another product of the supplier already uses: what the form
 * shows on those fields before saving, so the supplier fixes them and the autosave goes on.
 */
export async function findSkusTakenOutsideModel(
  executor: DatabaseExecutor,
  input: Pick<CatalogSaveModelDraftInput, "supplierId" | "modelId" | "grid">,
): Promise<string[]> {
  const skus = input.grid.combinations.map((combination) => combination.sku);
  if (skus.length === 0) {
    return [];
  }
  const taken = await executor
    .select({ sku: supplierProducts.sku })
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, input.supplierId),
        inArray(supplierProducts.sku, skus),
        or(isNull(supplierProducts.modelId), ne(supplierProducts.modelId, input.modelId)),
      ),
    )
    .orderBy(asc(supplierProducts.sku));
  return taken.map((row) => row.sku);
}

/** The same check inside the save, for a SKU another product took since the form checked. */
async function assertSkusFreeOutsideModel(
  transaction: DatabaseExecutor,
  input: CatalogSaveModelDraftInput,
): Promise<void> {
  const taken = await findSkusTakenOutsideModel(transaction, input);
  if (taken.length > 0) {
    throw conflictError(
      `Já existe outro produto com ${taken.length === 1 ? "o código" : "os códigos"} ${taken.join(", ")} neste fornecedor`,
    );
  }
}

/** An untouched count is not written back (a sale may have moved it); a typed one needs the shelf. */
function stockToWrite(stored: StoredCombination, sent: GridDraftCombination): number {
  const { expectedStock, stock } = sent;
  if (stock === expectedStock || stock === stored.stock) {
    return stored.stock;
  }

  if (stored.stock !== expectedStock) {
    throw conflictError(STOCK_MOVED_MESSAGE);
  }

  return stock;
}

async function writeCombinations(
  transaction: DatabaseExecutor,
  input: CatalogSaveModelDraftInput,
  stored: readonly StoredCombination[],
): Promise<void> {
  const storedByPair = new Map(stored.map((entry) => [pairKey(entry.color, entry.size), entry]));
  const grid = gridOfDraft(input.grid);
  const photos = new Map(grid.colors.map((color) => [color.name, color.imageUrls]));
  const model = { supplierId: input.supplierId, modelId: input.modelId, values: input.values };
  for (const [index, combination] of grid.combinations.entries()) {
    const sent = input.grid.combinations[index];
    const existing = storedByPair.get(pairKey(combination.color, combination.size));
    if (sent === undefined) {
      throw new Error(`Grid combination ${index} missing from the draft`);
    }
    if (existing === undefined) {
      await transaction
        .insert(supplierProducts)
        .values({ ...combinationRow({ ...model, photos }, combination), reviewStatus: "draft" });
      continue;
    }
    await transaction
      .update(supplierProducts)
      .set({
        sku: combination.sku,
        costCents: combination.costCents,
        suggestedPriceCents: combination.suggestedPriceCents,
        stock: stockToWrite(existing, sent),
        active: true,
        ...combinationOwnFields(combination),
      })
      .where(eq(supplierProducts.id, existing.id));
  }
}

export async function categorySlugOf(
  transaction: DatabaseExecutor,
  categoryId: string | null,
): Promise<string | null> {
  if (categoryId === null) {
    return null;
  }
  const [category] = await transaction
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (category === undefined) {
    throw validationError(`Categoria ${categoryId} não encontrada; escolha uma da lista`);
  }
  return category.slug;
}

function saleBlockers(
  row: typeof supplierProducts.$inferSelect,
  categorySlug: string | null,
  fallback: FiscalFallback | null,
) {
  const report = evaluateCompleteness(
    {
      ...row,
      fiscal: withFiscalFallback(readProductFiscal(row.fiscal), fallback),
      fiscalRequired: row.fiscalRequired,
    },
    requiredAttributesFor(categorySlug),
  );
  const contact = firstTextWithContact({
    title: row.title,
    description: row.description,
    ...row.mercadoLivreAttributes,
  });
  return {
    completeness: report.blocking
      .filter((issue) => issue.field !== "stock")
      .map((issue) => issue.message),
    contact:
      contact === null ? null : `${SUPPLIER_TEXT_CONTACT_REFUSED} Corrija o campo "${contact}".`,
    prohibited: isProhibitedProduct(row),
  };
}

/**
 * What stops one combination from being sold, besides its stock: a size may be out of stock while
 * the others sell. Messages are the completeness ones, prefixed by the combination's name.
 */
function publishingProblems(
  row: typeof supplierProducts.$inferSelect,
  categorySlug: string | null,
  fallback: FiscalFallback | null,
): string[] {
  const label = combinationLabel(row.color, row.size);
  const blockers = saleBlockers(row, categorySlug, fallback);
  return [
    ...blockers.completeness.map((message) => `${label}: ${message}`),
    ...(blockers.contact === null ? [] : [blockers.contact]),
    ...(blockers.prohibited ? [`${label}: este produto não pode ser vendido`] : []),
  ];
}

/** What stops a product from being sold besides its stock, in the completeness words. */
export function saleProblems(
  row: typeof supplierProducts.$inferSelect,
  categorySlug: string | null,
  fallback: FiscalFallback | null,
): string[] {
  const blockers = saleBlockers(row, categorySlug, fallback);
  return [
    ...blockers.completeness,
    ...(blockers.contact === null ? [] : [blockers.contact]),
    ...(blockers.prohibited ? ["Este produto não pode ser vendido"] : []),
  ];
}

/** A combination on sale goes back to draft when an edit of the model leaves it unsellable. */
export async function demoteUnsellableCombinations(
  transaction: DatabaseExecutor,
  input: { supplierId: string; modelId: string; categoryId: string | null },
): Promise<void> {
  const [slug, fallback, rows] = await Promise.all([
    categorySlugOf(transaction, input.categoryId),
    getSupplierFiscalFallback(transaction, input.supplierId),
    modelRows(transaction, input.modelId),
  ]);
  const unsellable = rows
    .filter((row) => row.reviewStatus === "approved")
    .filter((row) => publishingProblems(row, slug, fallback).length > 0)
    .map((row) => row.id);
  if (unsellable.length > 0) {
    await transaction
      .update(supplierProducts)
      .set({ reviewStatus: "draft" })
      .where(inArray(supplierProducts.id, unsellable));
  }
}

async function modelRows(transaction: DatabaseExecutor, modelId: string) {
  return await transaction
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.modelId, modelId))
    .orderBy(asc(supplierProducts.id));
}

async function requireModel(
  transaction: DatabaseExecutor,
  ref: CatalogModelRef,
): Promise<ProductModelDetail> {
  const detail = await getProductModel(transaction, ref);
  if (detail === null) {
    throw notFoundError("Produto não encontrado neste fornecedor");
  }
  return detail;
}

/**
 * Autosave of the supplier's grid form: the model's shared data, its colours and sizes, and one
 * product per combination. Combinations taken out are deleted, or only go off sale once listed
 * or sold; every combination is then rewritten from the model.
 *
 * @throws AppError NOT_FOUND when the model belongs to another supplier; CONFLICT when it changed
 *   in another window, a SKU belongs to another product, or a sale moved a stock being typed;
 *   VALIDATION when a sold combination would lose its colour or size.
 */
export async function saveProductModelDraft(
  database: Database,
  input: CatalogSaveModelDraftInput,
): Promise<ProductModelDetail> {
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, input.supplierId);
    await assertIcmsFitsRegime(transaction, input);
    await categorySlugOf(transaction, input.values.categoryId);
    await writeModel(transaction, input);
    await assertSkusFreeOutsideModel(transaction, input);
    await applyRenames(transaction, input.modelId, input.grid);
    const stored = await lockStoredCombinations(transaction, input.modelId);
    await removeLeavingCombinations(transaction, input.grid, stored);
    await writeOptions(transaction, input.modelId, input.grid);
    await writeCombinations(transaction, input, stored);
    await rewriteCombinations(transaction, input.modelId, input.values);
    await demoteUnsellableCombinations(transaction, {
      supplierId: input.supplierId,
      modelId: input.modelId,
      categoryId: input.values.categoryId,
    });
    return await requireModel(transaction, input);
  });
}

function storedGridOf(detail: ProductModelDetail) {
  return {
    colors: detail.colors,
    sizes: detail.sizes,
    combinations: detail.combinations.filter((combination) => combination.active),
  };
}

/**
 * Puts every combination of the grid on sale at once (no team review). Refused, naming each
 * combination and what it lacks, while the grid or any combination cannot be sold.
 *
 * @throws AppError NOT_FOUND when the model is not the supplier's; VALIDATION when something
 *   blocks publishing.
 */
export async function publishProductModel(
  database: Database,
  ref: CatalogModelRef,
  now: Date = new Date(),
): Promise<ProductModelDetail> {
  return await database.transaction(async (transaction) => {
    await lockSupplier(transaction, ref.supplierId);
    const detail = await requireModel(transaction, ref);
    const gridProblemsFound = gridProblems(storedGridOf(detail));
    const rows = (await modelRows(transaction, ref.modelId)).filter((row) => row.active);
    const [slug, fallback] = await Promise.all([
      categorySlugOf(transaction, detail.values.categoryId),
      getSupplierFiscalFallback(transaction, ref.supplierId),
    ]);
    const problems = [
      ...gridProblemsFound,
      ...(rows.some((row) => row.stock > 0)
        ? []
        : ["Informe o estoque de pelo menos uma combinação"]),
      ...new Set(rows.flatMap((row) => publishingProblems(row, slug, fallback))),
    ];
    if (problems.length > 0) {
      throw validationError(
        `Falta completar antes de publicar: ${problems.slice(0, MAX_PUBLISH_PROBLEMS_SHOWN).join("; ")}`,
      );
    }
    const drafts = rows.filter((row) => row.reviewStatus !== "approved").map((row) => row.id);
    if (drafts.length > 0) {
      await transaction
        .update(supplierProducts)
        .set({ reviewStatus: "approved", submittedAt: now, rejectionReasons: [] })
        .where(inArray(supplierProducts.id, drafts));
    }
    return await requireModel(transaction, ref);
  });
}

/** What the supplier reads when a combination was already listed or sold. */
export const MODEL_IN_USE_MESSAGE =
  "Uma das combinações já foi anunciada ou vendida: tire o produto de venda em vez de excluir.";

/**
 * Deletes a model nobody ever listed or sold, with all its combinations.
 *
 * @throws AppError NOT_FOUND when the model is not the supplier's; CONFLICT when a combination was
 *   listed or sold.
 */
export async function deleteUnsoldProductModel(
  database: Database,
  ref: CatalogModelRef,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await lockSupplier(transaction, ref.supplierId);
    await requireModel(transaction, ref);
    const stored = await lockStoredCombinations(transaction, ref.modelId);
    if (stored.some((combination) => combination.sold)) {
      throw conflictError(MODEL_IN_USE_MESSAGE);
    }
    await transaction.delete(supplierProducts).where(eq(supplierProducts.modelId, ref.modelId));
    await transaction.delete(productModels).where(eq(productModels.id, ref.modelId));
  });
}
