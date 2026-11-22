import {
  MAX_MODEL_CODE_LENGTH,
  MAX_MODEL_TITLE_LENGTH,
  modelCodeFromTitle,
  optionKey,
} from "./product-grid.ts";

/** One product of the supplier's catalog, before it is written as a line of the product CSV. */
export interface CatalogRecord {
  readonly sku: string;
  /** The title the line carries as a product of its own ("Sandália - Preto 38"). */
  readonly title: string;
  /** The product's name without its colour and size, shared by a grid. */
  readonly modelTitle: string;
  /** The supplier's own name for the product: its colours and sizes share it, listing or not. */
  readonly supplierName: string;
  readonly description: string;
  readonly cost: string;
  readonly stock: string;
  readonly categorySlug: string;
  readonly imageUrls: readonly string[];
  readonly suggestedPrice: string;
  readonly color: string | null;
  readonly size: string | null;
  /** Whether a Shopee listing supplied its title, description and photos. */
  readonly enriched: boolean;
}

export interface CatalogGridCells {
  readonly modelCode: string;
  readonly color: string | null;
  readonly size: string | null;
}

export type WithGrid<Record extends CatalogRecord> = Record & {
  readonly grid: CatalogGridCells | null;
};

export type CatalogGridRecord = WithGrid<CatalogRecord>;

/** Photos a catalog row (or a grid's colour) keeps, the product import's own limit. */
export const MAX_CATALOG_IMAGES = 20;

const CODE_HASH_LENGTH = 6;
// Leaves room for "-<hash>" and the "-2" suffix a repeated code gets, inside 60 characters.
const CODE_BASE_LENGTH = MAX_MODEL_CODE_LENGTH - CODE_HASH_LENGTH - 1 - 4;

// Colours compared as the planner compares them: "Café", "cafe " and "Cafe" are one colour.
const colorKey = (record: CatalogRecord): string =>
  record.color === null ? "" : optionKey(record.color);

const withoutVariant = (record: CatalogRecord): boolean =>
  record.color === null && record.size === null;

// FNV-1a: the same name always gives the same short hash, so a reimport keeps the code.
function nameHash(text: string): string {
  let hash = 0x81_1c_9d_c5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(CODE_HASH_LENGTH, "0").slice(-CODE_HASH_LENGTH);
}

// Readable from the name, unique by its hash: long names that differ only at the end, and a
// grid typed in the form with a similar title, never share a code.
function catalogModelCode(nameKey: string): string {
  const base = modelCodeFromTitle(nameKey).slice(0, CODE_BASE_LENGTH).replaceAll(/-+$/g, "");
  return `${base}-${nameHash(nameKey)}`;
}

function groupsByName<Record extends CatalogRecord>(
  records: readonly Record[],
): Map<string, Record[]> {
  const groups = new Map<string, Record[]>();
  for (const record of records) {
    if (withoutVariant(record)) {
      continue;
    }
    const key = optionKey(record.supplierName);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [record]);
      continue;
    }
    group.push(record);
  }
  return groups;
}

// A grid has the same options on every row: a "Único" row among sized ones, or a row without
// a colour among coloured ones, keeps the product as separate rows, as before grids.
function mixedOptions(records: readonly CatalogRecord[]): boolean {
  const colored = records.filter((record) => record.color !== null).length;
  const sized = records.filter((record) => record.size !== null).length;
  const partly = (count: number) => count > 0 && count < records.length;
  return partly(colored) || partly(sized);
}

// A colour's photos: every photo its rows bring, so sizes listing them apart never disagree.
function photosByColor(records: readonly CatalogRecord[]): Map<string, string[]> {
  const photos = new Map<string, Set<string>>();
  for (const record of records) {
    const key = colorKey(record);
    const known = photos.get(key) ?? new Set<string>();
    for (const url of record.imageUrls) {
      known.add(url);
    }
    photos.set(key, known);
  }
  return new Map([...photos].map(([key, urls]) => [key, [...urls].slice(0, MAX_CATALOG_IMAGES)]));
}

// The data a grid shares, taken once for all its rows: the row a Shopee listing enriched leads,
// so rows without a listing never disagree with it.
function sharedOf(records: readonly CatalogRecord[]) {
  const lead = records.find((record) => record.enriched) ?? records[0];
  return {
    modelTitle: (lead?.modelTitle ?? "").slice(0, MAX_MODEL_TITLE_LENGTH),
    description: lead?.description ?? "",
    categorySlug: records.find((record) => record.categorySlug !== "")?.categorySlug ?? "",
  };
}

function asGrid<Record extends CatalogRecord>(
  code: string,
  records: readonly Record[],
): WithGrid<Record>[] {
  const shared = sharedOf(records);
  const photos = photosByColor(records);
  return records.map((record) => ({
    ...record,
    ...shared,
    imageUrls: photos.get(colorKey(record)) ?? record.imageUrls,
    grid: { modelCode: code, color: record.color, size: record.size },
  }));
}

// Whether the rows of one product stay separate products, as before grids.
function staysSeparate(
  records: readonly CatalogRecord[],
  singleSkus: ReadonlySet<string>,
): boolean {
  return (
    records.length < 2 ||
    mixedOptions(records) ||
    records.some((record) => singleSkus.has(record.sku))
  );
}

/**
 * Catalog rows of one product in two or more colours or sizes, written as one grid: rows with
 * the same "Nome produto" (accents, case and spacing aside) get one model code, made from the
 * name and a short hash of it, and their own colour and size. As before grids, a product stays
 * separate rows when it has a single row, mixes rows with and without a colour or size, or has a
 * SKU the supplier already sells as a product of its own (`singleSkus`): reimporting an old
 * catalog changes nothing.
 */
export function groupCatalogGrids<Record extends CatalogRecord>(
  records: readonly Record[],
  singleSkus: ReadonlySet<string> = new Set(),
): WithGrid<Record>[] {
  const grids = new Map<Record, WithGrid<Record>>();
  for (const [nameKey, group] of groupsByName(records)) {
    if (staysSeparate(group, singleSkus)) {
      continue;
    }
    const rows = asGrid(catalogModelCode(nameKey), group);
    group.forEach((record, index) => {
      const row = rows[index];
      if (row !== undefined) {
        grids.set(record, row);
      }
    });
  }
  return records.map((record) => grids.get(record) ?? { ...record, grid: null });
}
