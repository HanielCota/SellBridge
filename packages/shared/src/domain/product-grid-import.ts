import type { ProductCsvError, ProductCsvRow } from "./product-csv.ts";
import {
  combinationLabel,
  combinationTitle,
  gridProblems,
  MAX_GRID_COMBINATIONS,
  sortSizeNames,
} from "./product-grid.ts";
import { stripAccents } from "./text.ts";

/**
 * Spreadsheet rows that share a "codigo_modelo" become one colour and size grid, one row per
 * combination (decision of 19/11/2026, slice 3). A grid is only ever created for new SKUs: a
 * group where a SKU already exists as a product of its own goes in as products of their own, as
 * before, so re-importing an old catalog (one product per size) changes nothing.
 */

type CsvProduct = ProductCsvRow["product"];

/** What the import already holds for a SKU of the file. */
export interface ExistingImportSku {
  readonly modelId: string | null;
  readonly modelCode: string | null;
  readonly color: string | null;
  readonly size: string | null;
}

/** A grid the supplier already has, found by its code. */
export interface ExistingImportModel {
  readonly id: string;
  readonly code: string;
  readonly colors: readonly string[];
  readonly sizes: readonly string[];
  /** Every colour and size pair it already sells, as "colour\u0000size". */
  readonly pairs: ReadonlySet<string>;
}

export interface GridImportCombination {
  readonly line: number;
  readonly product: CsvProduct;
  readonly color: string | null;
  readonly size: string | null;
}

/** New combinations for a new grid (`modelId` null) or for one the supplier has. */
export interface GridImportGroup {
  readonly modelCode: string;
  readonly modelId: string | null;
  /** The first new row: the model's shared data come from it. */
  readonly first: CsvProduct;
  readonly colors: readonly { name: string; imageUrls: readonly string[] }[];
  readonly sizes: readonly string[];
  readonly combinations: readonly GridImportCombination[];
}

export interface GridImportPlan {
  /** Rows the import writes as it always did: products of their own and existing combinations. */
  readonly plainRows: readonly ProductCsvRow[];
  readonly grids: readonly GridImportGroup[];
  readonly errors: readonly ProductCsvError[];
  /** What the supplier should know but need not fix, by line. */
  readonly notices: readonly ProductCsvError[];
}

function nameKey(name: string | null): string {
  return name === null ? "" : stripAccents(name).trim().replaceAll(/\s+/g, " ").toLowerCase();
}

/** One colour and size pair as people read it, to tell whether a grid already sells it. */
export function gridPairKey(color: string | null, size: string | null): string {
  return pairKey(color, size);
}

function pairKey(color: string | null, size: string | null): string {
  return `${nameKey(color)}\u0000${nameKey(size)}`;
}

/** The row without its grid cells: what the plain import reads. */
function plainRow(row: ProductCsvRow, title: string = row.product.title): ProductCsvRow {
  const { grid: _cells, ...product } = row.product;
  return { line: row.line, product: { ...product, title } };
}

function groupsByCode(rows: readonly ProductCsvRow[]) {
  const plain: ProductCsvRow[] = [];
  const groups = new Map<string, ProductCsvRow[]>();
  for (const row of rows) {
    const cells = row.product.grid;
    if (cells === undefined) {
      plain.push(row);
      continue;
    }
    groups.set(cells.modelCode, [...(groups.get(cells.modelCode) ?? []), row]);
  }
  return { plain, groups };
}

const SHARED_FIELDS = [
  ["title", "título"],
  ["description", "descrição"],
  ["categorySlug", "categoria"],
] as const;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner === null || typeof inner !== "object" || Array.isArray(inner)
      ? inner
      : Object.fromEntries(
          Object.entries(inner).toSorted(([first], [second]) => first.localeCompare(second)),
        ),
  );
}

/** Attributes and NF-e data every combination shares: the barcode and weight are each one's. */
function sharedSheet(product: CsvProduct) {
  const { GTIN: _barcode, ...attributes } = product.mercadoLivreAttributes ?? {};
  const { netWeightGrams: _weight, ...fiscal } = product.fiscal ?? {};
  return { attributes, fiscal };
}

/** A filled value of `own` that `other` holds differently (blank cells inherit). */
function differs(own: Record<string, unknown>, other: Record<string, unknown>): boolean {
  return Object.entries(own).some(
    ([key, value]) =>
      value !== null && value !== undefined && stableJson(value) !== stableJson(other[key]),
  );
}

/** Why a row disagrees with the first row of its grid, or null when it agrees. */
function sharedConflict(first: ProductCsvRow, row: ProductCsvRow, code: string): string | null {
  for (const [field, name] of SHARED_FIELDS) {
    const value = row.product[field] ?? "";
    if (value !== "" && value !== (first.product[field] ?? "")) {
      return `Código do modelo: a ${name} é diferente da linha ${first.line} do modelo ${code}. Use a mesma ${name} em todas as linhas do modelo`;
    }
  }
  const mine = sharedSheet(row.product);
  const theirs = sharedSheet(first.product);
  if (differs(mine.attributes, theirs.attributes) || differs(mine.fiscal, theirs.fiscal)) {
    return `Código do modelo: a ficha ou os dados fiscais são diferentes da linha ${first.line} do modelo ${code}. Só o código de barras e o peso líquido podem mudar entre as linhas`;
  }
  return null;
}

/** Colours in the order they first appear, with the photos of their rows. */
function colorsOf(rows: readonly ProductCsvRow[], code: string, errors: ProductCsvError[]) {
  const colors = new Map<string, { name: string; imageUrls: readonly string[]; line: number }>();
  for (const row of rows) {
    const name = row.product.grid?.color ?? null;
    if (name === null) {
      continue;
    }
    const known = colors.get(nameKey(name));
    const photos = row.product.imageUrls;
    if (known === undefined) {
      colors.set(nameKey(name), { name, imageUrls: photos, line: row.line });
      continue;
    }
    if (
      photos.length > 0 &&
      known.imageUrls.length > 0 &&
      stableJson(photos) !== stableJson(known.imageUrls)
    ) {
      errors.push({
        line: row.line,
        reason: `Imagens: as fotos da cor ${name} são diferentes da linha ${known.line} do modelo ${code}. Repita as mesmas fotos ou deixe em branco`,
      });
    }
    if (known.imageUrls.length === 0 && photos.length > 0) {
      colors.set(nameKey(name), { ...known, imageUrls: photos });
    }
  }
  return [...colors.values()].map(({ name, imageUrls }) => ({ name, imageUrls }));
}

function sizesOf(rows: readonly ProductCsvRow[]): string[] {
  const sizes = new Map<string, string>();
  for (const row of rows) {
    const name = row.product.grid?.size ?? null;
    if (name !== null && !sizes.has(nameKey(name))) {
      sizes.set(nameKey(name), name);
    }
  }
  return sortSizeNames([...sizes.values()]);
}

/** The grid's own spelling of a name ("preto " in a row is the grid's "Preto"). */
function canonical(name: string | null, names: readonly string[]): string | null {
  if (name === null) {
    return null;
  }
  return names.find((known) => nameKey(known) === nameKey(name)) ?? name.trim();
}

function combinationsOf(
  rows: readonly ProductCsvRow[],
  names: { colors: readonly string[]; sizes: readonly string[] },
): GridImportCombination[] {
  return rows.map((row) => ({
    line: row.line,
    product: plainRow(row).product,
    color: canonical(row.product.grid?.color ?? null, names.colors),
    size: canonical(row.product.grid?.size ?? null, names.sizes),
  }));
}

/** A new grid: shared data agree, and the grid follows the same rules as the form's. */
function newGrid(code: string, rows: readonly ProductCsvRow[], errors: ProductCsvError[]) {
  const [first] = rows;
  if (first === undefined) {
    return null;
  }
  const before = errors.length;
  for (const row of rows.slice(1)) {
    const conflict = sharedConflict(first, row, code);
    if (conflict !== null) {
      errors.push({ line: row.line, reason: conflict });
    }
  }
  const colors = colorsOf(rows, code, errors);
  const sizes = sizesOf(rows);
  const combinations = combinationsOf(rows, { colors: colors.map((color) => color.name), sizes });
  const problems = gridProblems({
    colors: colors.map((color) => ({ name: color.name, imageUrls: [...color.imageUrls] })),
    sizes,
    combinations: combinations.map((combination) => ({
      color: combination.color,
      size: combination.size,
      sku: combination.product.sku,
      gtin: null,
      costCents: combination.product.costCents,
      suggestedPriceCents: combination.product.suggestedPriceCents ?? 0,
      stock: combination.product.stock,
      netWeightGrams: null,
    })),
  });
  for (const problem of problems) {
    errors.push({ line: first.line, reason: `Código do modelo: ${problem} (modelo ${code})` });
  }
  if (errors.length > before) {
    return null;
  }
  return {
    modelCode: code,
    modelId: null,
    first: plainRow(first).product,
    colors,
    sizes,
    combinations,
  };
}

/** New combinations for a grid the supplier has: its shared data stay as the form saved them. */
function addedToGrid(
  model: ExistingImportModel,
  rows: readonly ProductCsvRow[],
  errors: ProductCsvError[],
) {
  const [first] = rows;
  if (first === undefined) {
    return null;
  }
  const before = errors.length;
  const knownColors = new Set(model.colors.map(nameKey));
  const knownSizes = new Set(model.sizes.map(nameKey));
  const colors = colorsOf(rows, model.code, errors);
  const sizes = sizesOf(rows);
  const seen = new Set(model.pairs);
  for (const row of rows) {
    const key = pairKey(row.product.grid?.color ?? null, row.product.grid?.size ?? null);
    if (seen.has(key)) {
      const label = combinationLabel(
        row.product.grid?.color ?? null,
        row.product.grid?.size ?? null,
      );
      errors.push({
        line: row.line,
        reason: `Cor e tamanho: o modelo ${model.code} já tem a combinação ${label}. Use o SKU dela ou outra cor ou tamanho`,
      });
    }
    seen.add(key);
  }
  if (seen.size > MAX_GRID_COMBINATIONS) {
    errors.push({
      line: first.line,
      reason: `Código do modelo: o modelo ${model.code} passaria de ${MAX_GRID_COMBINATIONS} combinações (ficaria com ${seen.size}). Divida em dois modelos`,
    });
  }
  if (errors.length > before) {
    return null;
  }
  return {
    modelCode: model.code,
    modelId: model.id,
    first: plainRow(first).product,
    colors: colors.filter((color) => !knownColors.has(nameKey(color.name))),
    sizes: sizes.filter((size) => !knownSizes.has(nameKey(size))),
    combinations: combinationsOf(rows, {
      colors: [...model.colors, ...colors.map((color) => color.name)],
      sizes: [...model.sizes, ...sizes],
    }),
  };
}

/** A row whose SKU is already a combination: it must keep its grid, colour and size. */
function existingCombinationProblem(
  row: ProductCsvRow,
  existing: ExistingImportSku,
): string | null {
  const cells = row.product.grid;
  if (cells === undefined) {
    return null;
  }
  const sameGrid = existing.modelCode === cells.modelCode;
  const samePair = pairKey(existing.color, existing.size) === pairKey(cells.color, cells.size);
  if (sameGrid && samePair) {
    return null;
  }
  return `Cor e tamanho: o SKU ${row.product.sku} já é ${combinationLabel(existing.color, existing.size)} do modelo ${existing.modelCode ?? ""}. Para mudar o modelo, a cor ou o tamanho, use o cadastro do produto`;
}

/**
 * Splits the file's rows into what the import writes as before and the grids it creates or
 * grows, with an error per line for whatever cannot become a grid.
 */
export function planGridImport(input: {
  readonly rows: readonly ProductCsvRow[];
  readonly existingSkus: ReadonlyMap<string, ExistingImportSku>;
  readonly existingModels: ReadonlyMap<string, ExistingImportModel>;
}): GridImportPlan {
  const { plain, groups } = groupsByCode(input.rows);
  const plainRows: ProductCsvRow[] = [...plain];
  const grids: GridImportGroup[] = [];
  const errors: ProductCsvError[] = [];
  const notices: ProductCsvError[] = [];
  for (const [code, rows] of groups) {
    const single = rows.find((row) => input.existingSkus.get(row.product.sku)?.modelId === null);
    if (single !== undefined) {
      plainRows.push(
        ...rows.map((row) =>
          plainRow(
            row,
            combinationTitle(
              row.product.title,
              row.product.grid?.color ?? null,
              row.product.grid?.size ?? null,
            ),
          ),
        ),
      );
      notices.push({
        line: rows[0]?.line ?? single.line,
        reason: `As linhas do modelo ${code} entraram como produtos separados, porque o SKU ${single.product.sku} já existe como produto separado. Juntar produtos que já existem numa grade vai ter uma tela própria`,
      });
      continue;
    }
    const fresh: ProductCsvRow[] = [];
    for (const row of rows) {
      const existing = input.existingSkus.get(row.product.sku);
      if (existing === undefined) {
        fresh.push(row);
        continue;
      }
      const problem = existingCombinationProblem(row, existing);
      if (problem === null) {
        plainRows.push(plainRow(row));
        continue;
      }
      errors.push({ line: row.line, reason: problem });
    }
    const model = input.existingModels.get(code);
    const group =
      model === undefined ? newGrid(code, fresh, errors) : addedToGrid(model, fresh, errors);
    if (group !== null) {
      grids.push(group);
    }
  }
  return { plainRows, grids, errors, notices };
}
