import { z } from "zod";
import { adminProductValuesSchema } from "../schemas/admin-suppliers.ts";
import { freeText } from "../schemas/common.ts";
import { isValidGtin } from "./product-csv-attributes.ts";
import { type ProductFiscalPatch, productFiscalSchema } from "./product-fiscal.ts";
import type { WarrantyType } from "./product-sale-terms.ts";
import { supplierImageUrlSchema } from "./supplier-panel-image-urls.ts";
import { stripAccents } from "./text.ts";

/**
 * Product grids (decision 2026-11-18): a model sold in colours and sizes, each combination with
 * its own SKU, GTIN, stock and price. Shopee caps an item at 50 models and two variation tiers,
 * the tightest of the marketplaces we publish to, so the grid follows it everywhere.
 */
export const MAX_GRID_COMBINATIONS = 50;
export const MAX_GRID_OPTION_LENGTH = 40;
const MAX_OPTION_PHOTOS = 20;
const PRODUCT_TITLE_MAX_LENGTH = 300;
/** Leaves room for " - {colour} {size}" inside the product title limit. */
export const MAX_MODEL_TITLE_LENGTH =
  PRODUCT_TITLE_MAX_LENGTH - " - ".length - " ".length - 2 * MAX_GRID_OPTION_LENGTH;

export const MAX_MODEL_CODE_LENGTH = 60;

/** The supplier's code for a model, as the spreadsheet's "codigo_modelo" carries it. */
export const modelCodeSchema = freeText()
  .trim()
  .min(1, "Informe o código do modelo. Exemplo: TENIS-CASUAL")
  .max(MAX_MODEL_CODE_LENGTH, `Use até ${MAX_MODEL_CODE_LENGTH} caracteres no código do modelo`);

/**
 * How two model codes are compared: "tenis-casual" and "TENIS-CASUAL" are the same model, in the
 * spreadsheet, in the database and in codes stored before the comparison ignored case.
 */
export function modelCodeKey(code: string): string {
  return code.trim().toUpperCase();
}

/** Room for the "-2", "-3"… a repeated code gets (see `modelCodeFor`). */
const CODE_SUFFIX_ROOM = 4;

/** "Tênis Casual Couro" → "TENIS-CASUAL-COURO": the code a grid typed in the form starts with. */
export function modelCodeFromTitle(title: string): string {
  const code = stripAccents(title)
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, MAX_MODEL_CODE_LENGTH - CODE_SUFFIX_ROOM)
    .replaceAll(/-+$/g, "");
  return code === "" ? "MODELO" : code;
}

/** Refuses an edit of one combination's shared data outside its grid. */
export const COMBINATION_EDITED_OUTSIDE_GRID_MESSAGE =
  "Este produto faz parte de uma grade de cores e tamanhos: altere o nome, as fotos e a ficha pela grade, no cadastro do produto.";

/**
 * What the grid itself answers in Mercado Livre's sheet: each combination's colour and size,
 * so the model's sheet never asks them.
 */
export const GRID_AXIS_ATTRIBUTES: ReadonlySet<string> = new Set(["COLOR", "MAIN_COLOR", "SIZE"]);

/** Identifies one unit of a model: a barcode never belongs to the whole grid. */
const COMBINATION_ONLY_ATTRIBUTES: ReadonlySet<string> = new Set(["GTIN"]);

const optionNameSchema = freeText()
  .trim()
  .min(1, "Informe o nome")
  .max(MAX_GRID_OPTION_LENGTH, `Use até ${MAX_GRID_OPTION_LENGTH} letras`);

const gtinSchema = freeText()
  .trim()
  .refine(isValidGtin, "Confira o código de barras (GTIN): 8, 12, 13 ou 14 números");

export const gridColorSchema = z.object({
  name: optionNameSchema,
  imageUrls: z.array(supplierImageUrlSchema).max(MAX_OPTION_PHOTOS),
});
export type GridColor = z.infer<typeof gridColorSchema>;

export const gridCombinationSchema = z.object({
  color: optionNameSchema.nullable(),
  size: optionNameSchema.nullable(),
  sku: adminProductValuesSchema.shape.sku,
  gtin: gtinSchema.nullable(),
  costCents: adminProductValuesSchema.shape.costCents,
  suggestedPriceCents: adminProductValuesSchema.shape.suggestedPriceCents,
  stock: adminProductValuesSchema.shape.stock,
  netWeightGrams: productFiscalSchema.shape.netWeightGrams,
});
export type GridCombination = z.infer<typeof gridCombinationSchema>;

export const productGridSchema = z
  .object({
    colors: z.array(gridColorSchema).max(MAX_GRID_COMBINATIONS),
    sizes: z.array(optionNameSchema).max(MAX_GRID_COMBINATIONS),
    combinations: z.array(gridCombinationSchema).max(MAX_GRID_COMBINATIONS * 2),
  })
  .superRefine((grid, context) => {
    for (const problem of gridProblems(grid)) {
      context.addIssue({ code: "custom", message: problem });
    }
  });
export type ProductGrid = z.infer<typeof productGridSchema>;

/** Compares option names as people read them: "Preto" and "preto " are the same colour. */
function optionKey(name: string): string {
  return stripAccents(name).trim().replaceAll(/\s+/g, " ").toLowerCase();
}

/** "Preto 38", "Preto" or "38": how a combination is named next to the model's title. */
export function combinationLabel(color: string | null, size: string | null): string {
  return [color, size].filter((part) => part !== null).join(" ");
}

/** The full name of a combination, as orders, invoices and labels show it. */
export function combinationTitle(
  modelTitle: string,
  color: string | null,
  size: string | null,
): string {
  return `${modelTitle} - ${combinationLabel(color, size)}`;
}

function repeatedNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const name of names) {
    const key = optionKey(name);
    if (seen.has(key)) {
      repeated.push(name);
    }
    seen.add(key);
  }
  return repeated;
}

function axisProblem(
  axis: "cor" | "tamanho",
  value: string | null,
  names: ReadonlySet<string>,
  sku: string,
): string | null {
  if (names.size === 0) {
    return value === null ? null : `O SKU ${sku} tem ${axis}, mas a grade não tem ${axis}`;
  }
  if (value === null) {
    return `Escolha ${axis === "cor" ? "a cor" : "o tamanho"} do SKU ${sku}`;
  }
  if (!names.has(value)) {
    return `${axis === "cor" ? "A cor" : "O tamanho"} "${value}" do SKU ${sku} não está na grade`;
  }
  return null;
}

interface GridShape {
  colors: readonly GridColor[];
  sizes: readonly string[];
  combinations: readonly GridCombination[];
}

function combinationProblems(grid: GridShape): string[] {
  const colorNames = new Set(grid.colors.map((color) => color.name));
  const sizeNames = new Set(grid.sizes);
  const problems: string[] = [];
  const seenCombinations = new Set<string>();
  const seenSkus = new Set<string>();
  for (const combination of grid.combinations) {
    const axisProblems = [
      axisProblem("cor", combination.color, colorNames, combination.sku),
      axisProblem("tamanho", combination.size, sizeNames, combination.sku),
    ].filter((problem) => problem !== null);
    problems.push(...axisProblems);
    const label = combinationLabel(combination.color, combination.size);
    const key = `${combination.color ?? ""}\u0000${combination.size ?? ""}`;
    if (seenCombinations.has(key)) {
      problems.push(`A combinação ${label} aparece mais de uma vez`);
    }
    if (seenSkus.has(combination.sku)) {
      problems.push(`O SKU ${combination.sku} aparece em mais de uma combinação`);
    }
    seenCombinations.add(key);
    seenSkus.add(combination.sku);
  }
  return problems;
}

function unusedOptionProblems(grid: GridShape): string[] {
  const usedColors = new Set(grid.combinations.map((combination) => combination.color));
  const usedSizes = new Set(grid.combinations.map((combination) => combination.size));
  return [
    ...grid.colors
      .filter((color) => !usedColors.has(color.name))
      .map((color) => `A cor "${color.name}" não tem nenhuma combinação`),
    ...grid.sizes
      .filter((size) => !usedSizes.has(size))
      .map((size) => `O tamanho "${size}" não tem nenhuma combinação`),
  ];
}

/**
 * What makes a grid unsafe to store at all: too many combinations, repeated names, a combination
 * outside the grid, a repeated pair or SKU. A grid being typed may still lack combinations.
 */
export function gridStructureProblems(grid: GridShape): string[] {
  if (grid.combinations.length > MAX_GRID_COMBINATIONS) {
    return [
      `A grade pode ter até ${MAX_GRID_COMBINATIONS} combinações (recebido: ${grid.combinations.length}). Divida em dois modelos.`,
    ];
  }
  return [
    ...repeatedNames(grid.colors.map((color) => color.name)).map(
      (name) => `A cor "${name}" aparece mais de uma vez`,
    ),
    ...repeatedNames(grid.sizes).map((name) => `O tamanho "${name}" aparece mais de uma vez`),
    ...combinationProblems(grid),
  ];
}

/**
 * Everything wrong with a grid, in words the supplier can act on; empty when it can be sold.
 * Combinations may skip pairs (a colour without the biggest size), but every colour and size
 * listed must be sold in at least one of them.
 */
export function gridProblems(grid: GridShape): string[] {
  if (grid.colors.length === 0 && grid.sizes.length === 0) {
    return ["Informe pelo menos uma cor ou um tamanho"];
  }
  if (grid.combinations.length === 0) {
    return ["Informe pelo menos uma combinação de cor e tamanho"];
  }
  return [...gridStructureProblems(grid), ...unusedOptionProblems(grid)];
}

/** A colour or size as the form sends it: `previousName` when the supplier renamed it. */
export const gridDraftColorSchema = gridColorSchema.extend({
  previousName: optionNameSchema.optional(),
});
export const gridDraftSizeSchema = z.object({
  name: optionNameSchema,
  previousName: optionNameSchema.optional(),
});
export const gridDraftCombinationSchema = gridCombinationSchema.extend({
  /** The stock the form last showed: a sale meanwhile wins over a count left untouched. */
  expectedStock: z.number().int().optional(),
});

/**
 * The grid as the supplier is typing it, saved on every change: it may still lack combinations
 * or leave a colour unused, but never holds repeated names, pairs or SKUs.
 */
export const productGridDraftSchema = z
  .object({
    colors: z.array(gridDraftColorSchema).max(MAX_GRID_COMBINATIONS),
    sizes: z.array(gridDraftSizeSchema).max(MAX_GRID_COMBINATIONS),
    combinations: z.array(gridDraftCombinationSchema).max(MAX_GRID_COMBINATIONS * 2),
  })
  .superRefine((draft, context) => {
    for (const problem of gridStructureProblems(gridOfDraft(draft))) {
      context.addIssue({ code: "custom", message: problem });
    }
  });
export type ProductGridDraft = z.infer<typeof productGridDraftSchema>;

/** The draft without the form's bookkeeping (renames, the stock it showed). */
export function gridOfDraft(draft: {
  colors: readonly z.infer<typeof gridDraftColorSchema>[];
  sizes: readonly z.infer<typeof gridDraftSizeSchema>[];
  combinations: readonly z.infer<typeof gridDraftCombinationSchema>[];
}): ProductGrid {
  return {
    colors: draft.colors.map((color) => ({ name: color.name, imageUrls: color.imageUrls })),
    sizes: draft.sizes.map((size) => size.name),
    combinations: draft.combinations.map((combination) => ({
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
}

const LETTER_SIZE_RANK: ReadonlyMap<string, number> = new Map([
  ["RN", 0],
  ["PP", 1],
  ["XS", 1],
  ["P", 2],
  ["S", 2],
  ["M", 3],
  ["G", 4],
  ["L", 4],
  ["GG", 5],
  ["XL", 5],
  ["XG", 6],
  ["EG", 6],
  ["XXL", 6],
  ["XGG", 7],
  ["EGG", 7],
  ["XXXL", 7],
  ["G1", 8],
  ["G2", 9],
  ["G3", 10],
  ["G4", 11],
]);
const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)/;

/** 0: numbered sizes, by number; 1: letter sizes, small to big; 2: anything else, as given. */
function sizeSortKey(name: string, index: number): readonly [number, number] {
  const normalized = optionKey(name).toUpperCase();
  const number = LEADING_NUMBER.exec(normalized)?.[1];
  if (number !== undefined) {
    return [0, Number(number.replace(",", "."))];
  }
  const rank = LETTER_SIZE_RANK.get(normalized);
  if (rank !== undefined) {
    return [1, rank];
  }
  return [2, index];
}

/**
 * Sizes in the order a buyer expects (34, 35, 36; P, M, G), for grids read from a spreadsheet or
 * an ERP where rows come in any order. Sizes the rule does not know keep their order, last.
 */
export function sortSizeNames(names: readonly string[]): string[] {
  return names
    .map((name, index) => ({ name, index, key: sizeSortKey(name, index) }))
    .toSorted(
      (first, second) =>
        first.key[0] - second.key[0] || first.key[1] - second.key[1] || first.index - second.index,
    )
    .map((entry) => entry.name);
}

/** What a model shares with every combination (stored on `product_models`). */
export interface ProductModelShared {
  readonly title: string;
  readonly description: string;
  readonly categoryId: string | null;
  readonly imageUrls: readonly string[];
  readonly mercadoLivreAttributes: Readonly<Record<string, string>>;
  readonly mercadoLivreCategoryId: string | null;
  readonly mercadoLivreCategoryName: string | null;
  readonly warrantyType: WarrantyType | null;
  readonly warrantyDays: number | null;
  readonly videoUrl: string | null;
  readonly madeToOrderDays: number | null;
  readonly carrierOnly: boolean;
  readonly fiscal: ProductFiscalPatch;
}

/** What a combination keeps of its own, besides SKU, stock and prices. */
export interface CombinationOwnValues {
  readonly color: string | null;
  readonly size: string | null;
  /** The photos of its colour; empty when the colour has none. */
  readonly colorImageUrls: readonly string[];
  readonly variantAttributes: Readonly<Record<string, string>>;
  readonly variantFiscal: ProductFiscalPatch;
}

/** The product columns a combination takes from its model (see `materializeCombination`). */
export interface MaterializedCombination {
  readonly title: string;
  readonly description: string;
  readonly categoryId: string | null;
  readonly imageUrls: string[];
  readonly mercadoLivreAttributes: Record<string, string>;
  readonly mercadoLivreCategoryId: string | null;
  readonly mercadoLivreCategoryName: string | null;
  readonly warrantyType: WarrantyType | null;
  readonly warrantyDays: number | null;
  readonly videoUrl: string | null;
  readonly madeToOrderDays: number | null;
  readonly carrierOnly: boolean;
  readonly fiscal: ProductFiscalPatch;
}

function sharedAttributes(attributes: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([key]) => !COMBINATION_ONLY_ATTRIBUTES.has(key) && !GRID_AXIS_ATTRIBUTES.has(key),
    ),
  );
}

function filledFiscal(fiscal: ProductFiscalPatch): ProductFiscalPatch {
  return Object.fromEntries(
    Object.entries(fiscal).filter(([, value]) => value !== null && value !== undefined),
  );
}

/** The combination's colour and size, as the sheet names them ("Tênis - Preto 38" is size 38). */
function axisAttributes(own: Pick<CombinationOwnValues, "color" | "size">): Record<string, string> {
  return {
    ...(own.color === null ? {} : { COLOR: own.color }),
    ...(own.size === null ? {} : { SIZE: own.size }),
  };
}

/**
 * The full product a combination is, built from its model and its own values. The model is the
 * only place shared data is edited; every save rewrites its combinations with this, so catalog,
 * publishing, orders and invoices keep reading one complete product row as they always did.
 */
export function materializeCombination(
  model: ProductModelShared,
  own: CombinationOwnValues,
): MaterializedCombination {
  return {
    title: combinationTitle(model.title, own.color, own.size),
    description: model.description,
    categoryId: model.categoryId,
    imageUrls: [...(own.colorImageUrls.length > 0 ? own.colorImageUrls : model.imageUrls)],
    mercadoLivreAttributes: {
      ...sharedAttributes(model.mercadoLivreAttributes),
      ...axisAttributes(own),
      ...own.variantAttributes,
    },
    mercadoLivreCategoryId: model.mercadoLivreCategoryId,
    mercadoLivreCategoryName: model.mercadoLivreCategoryName,
    warrantyType: model.warrantyType,
    warrantyDays: model.warrantyDays,
    videoUrl: model.videoUrl,
    madeToOrderDays: model.madeToOrderDays,
    carrierOnly: model.carrierOnly,
    fiscal: { ...model.fiscal, ...filledFiscal(own.variantFiscal) },
  };
}

/** A combination's own attributes and fiscal fields, as the grid form or an import gives them. */
export function combinationOwnFields(combination: GridCombination): {
  variantAttributes: Record<string, string>;
  variantFiscal: ProductFiscalPatch;
} {
  return {
    variantAttributes: combination.gtin === null ? {} : { GTIN: combination.gtin },
    variantFiscal:
      combination.netWeightGrams === null ? {} : { netWeightGrams: combination.netWeightGrams },
  };
}
