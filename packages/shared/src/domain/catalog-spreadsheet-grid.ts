import { MAX_MODEL_TITLE_LENGTH, modelCodeFromTitle } from "./product-grid.ts";

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

const MAX_IMAGES = 20;

const colorKey = (record: CatalogRecord): string => record.color?.trim().toLowerCase() ?? "";

const withoutVariant = (record: CatalogRecord): boolean =>
  record.color === null && record.size === null;

function groupsByModelCode<Record extends CatalogRecord>(
  records: readonly Record[],
): Map<string, Record[]> {
  const groups = new Map<string, Record[]>();
  for (const record of records) {
    if (withoutVariant(record)) {
      continue;
    }
    const code = modelCodeFromTitle(record.supplierName);
    const group = groups.get(code);
    if (group === undefined) {
      groups.set(code, [record]);
      continue;
    }
    group.push(record);
  }
  return groups;
}

/** A colour's photos: every photo its rows bring, so sizes listing them apart never disagree. */
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
  return new Map([...photos].map(([key, urls]) => [key, [...urls].slice(0, MAX_IMAGES)]));
}

/**
 * The data a grid shares, taken once for all its rows: the row a Shopee listing enriched leads,
 * so rows without a listing never disagree with it.
 */
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

/**
 * Catalog rows of one product in two or more colours or sizes, written as one grid: the same
 * model code, generated from the supplier's name for the product, and each row's colour and size. A product with a
 * single colour and size stays a product of its own, as before grids existed.
 */
export function groupCatalogGrids<Record extends CatalogRecord>(
  records: readonly Record[],
): WithGrid<Record>[] {
  const grids = new Map<Record, WithGrid<Record>>();
  for (const [code, group] of groupsByModelCode(records)) {
    if (group.length < 2) {
      continue;
    }
    const rows = asGrid(code, group);
    group.forEach((record, index) => {
      const row = rows[index];
      if (row !== undefined) {
        grids.set(record, row);
      }
    });
  }
  return records.map((record) => grids.get(record) ?? { ...record, grid: null });
}
