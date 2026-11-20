import {
  planErpCatalogImport,
  withoutGridsOfSeparateProducts,
  type ErpCatalogItem,
  type ErpCatalogReadResult,
  type ErpImportRow,
} from "@sellbridge/shared/erp-catalog";

export interface BlingReadRows {
  readonly rows: ErpImportRow[];
  readonly skipped: ErpCatalogReadResult["skipped"];
  /** Products with variations that come in one product per variation; none while grids are off. */
  readonly separated: number;
  readonly truncated: boolean;
}

/** What decides whether a read's variations come in as grids. */
export interface BlingGridChoice {
  readonly gridColumns: boolean;
  /** SKUs the supplier already sells as products of their own. */
  readonly singleSkus: ReadonlySet<string>;
}

/**
 * The read's items as the import writes them: with grids off, exactly as stored; with grids
 * on, a grid with a SKU already sold separately goes back to separate products.
 */
export function gridReadyItems(
  items: readonly ErpCatalogItem[],
  choice: BlingGridChoice,
): readonly ErpCatalogItem[] {
  return choice.gridColumns ? withoutGridsOfSeparateProducts(items, choice.singleSkus) : items;
}

/** A finished read as the preview lists it, counted as the product list will show it. */
export function blingReadRows(
  result: ErpCatalogReadResult,
  existingCosts: ReadonlyMap<string, number>,
  choice: BlingGridChoice,
): BlingReadRows {
  return {
    rows: planErpCatalogImport(gridReadyItems(result.items, choice), existingCosts, {
      gridColumns: choice.gridColumns,
    }),
    skipped: result.skipped,
    separated: choice.gridColumns ? result.separated.length : 0,
    truncated: result.truncated,
  };
}
