import type { ErpCatalogItem, ErpFiscalData } from "./erp-catalog.ts";
import { modelCodeKey, optionKey } from "./product-grid.ts";

const MAX_IMAGES = 20;

function firstOf<Value>(values: readonly (Value | null)[]): Value | null {
  return values.find((value) => value !== null) ?? null;
}

// Colours compared as the grid import compares them: "Café" and "Cafe" are one colour.
const colorKey = (item: ErpCatalogItem): string => {
  const color = item.grid?.color;
  return color === undefined || color === null ? "" : optionKey(color);
};

function sharedFiscal(items: readonly ErpCatalogItem[]): ErpFiscalData {
  return {
    ncm: firstOf(items.map((item) => item.fiscal.ncm)),
    origin: firstOf(items.map((item) => item.fiscal.origin)),
    unit: firstOf(items.map((item) => item.fiscal.unit)),
    cest: firstOf(items.map((item) => item.fiscal.cest)),
  };
}

function photosByColor(items: readonly ErpCatalogItem[]): Map<string, string[]> {
  const photos = new Map<string, Set<string>>();
  for (const item of items) {
    const known = photos.get(colorKey(item)) ?? new Set<string>();
    for (const url of item.imageUrls) {
      known.add(url);
    }
    photos.set(colorKey(item), known);
  }
  return new Map([...photos].map(([key, urls]) => [key, [...urls].slice(0, MAX_IMAGES)]));
}

function groupsByModel(items: readonly ErpCatalogItem[]): Map<string, ErpCatalogItem[]> {
  const groups = new Map<string, ErpCatalogItem[]>();
  for (const item of items) {
    const code = item.grid?.modelCode;
    if (code === undefined) {
      continue;
    }
    const key = modelCodeKey(code);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
      continue;
    }
    group.push(item);
  }
  return groups;
}

/** One grid's variations with the data a grid shares taken once: the first one that has it. */
function unified(items: readonly ErpCatalogItem[]): ErpCatalogItem[] {
  const description = items.find((item) => item.description !== "")?.description ?? "";
  const brand = firstOf(items.map((item) => item.brand));
  const weightGrams = firstOf(items.map((item) => item.weightGrams));
  const fiscal = sharedFiscal(items);
  const photos = photosByColor(items);
  return items.map((item) => ({
    ...item,
    description,
    brand,
    weightGrams,
    fiscal,
    imageUrls: photos.get(colorKey(item)) ?? item.imageUrls,
  }));
}

/**
 * The ERP items with each grid's shared data (description, brand, package weight, NF-e data,
 * a colour's photos) the same on all its variations, so an ERP that fills them on some
 * variations only never trips the import's rule that a grid's rows agree. Order is kept.
 */
export function unifyErpGrids(items: readonly ErpCatalogItem[]): ErpCatalogItem[] {
  const byItem = new Map<ErpCatalogItem, ErpCatalogItem>();
  for (const group of groupsByModel(items).values()) {
    const rows = unified(group);
    group.forEach((item, index) => {
      const row = rows[index];
      if (row !== undefined) {
        byItem.set(item, row);
      }
    });
  }
  return items.map((item) => byItem.get(item) ?? item);
}

/**
 * The ERP items with no grid for a product the supplier already sells separately: if any SKU of
 * a grid is in `singleSkus`, all its variations are written as separate products, exactly as
 * before grids, and counted that way in the preview. Grouping existing products is a screen of
 * its own, with confirmation.
 */
export function withoutGridsOfSeparateProducts(
  items: readonly ErpCatalogItem[],
  singleSkus: ReadonlySet<string>,
): ErpCatalogItem[] {
  const separateModels = new Set(
    items.filter((item) => singleSkus.has(item.sku)).flatMap((item) => gridKeyOf(item) ?? []),
  );
  return items.map((item) => {
    const key = gridKeyOf(item);
    return key !== null && separateModels.has(key) ? { ...item, grid: null } : item;
  });
}

function gridKeyOf(item: ErpCatalogItem): string | null {
  const { grid } = item;
  return grid === undefined || grid === null ? null : modelCodeKey(grid.modelCode);
}
