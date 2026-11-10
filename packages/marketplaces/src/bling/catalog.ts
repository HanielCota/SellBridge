import type { ErpCatalogItem } from "@sellbridge/shared/erp-catalog";
import { BLING_PAGE_LIMIT, type BlingClient } from "./client.ts";
import { blingProductToItems, type SkippedBlingProduct } from "./product-items.ts";

export interface BlingCatalogRead {
  readonly items: ErpCatalogItem[];
  readonly skipped: SkippedBlingProduct[];
  /** True when the catalog had more products than `maxProducts` and the rest was left out. */
  readonly truncated: boolean;
}

/** The list repeats each variation as its own row; its parent's detail already brings it. */
function isTopLevel(summary: { idProdutoPai?: number | null | undefined }): boolean {
  return summary.idProdutoPai == null || summary.idProdutoPai === 0;
}

/**
 * Reads the account's active products: the summary list page by page, then each product's
 * detail (NCM, weight and images only come there), stopping at `maxProducts` parents. At 3
 * requests per second, 300 products take about two minutes.
 */
export async function readBlingCatalog(
  client: BlingClient,
  options: { maxProducts: number },
): Promise<BlingCatalogRead> {
  const items: ErpCatalogItem[] = [];
  const skipped: SkippedBlingProduct[] = [];
  let read = 0;
  for (let page = 1; ; page += 1) {
    const summaries = await client.listProducts({ page });
    for (const summary of summaries.filter(isTopLevel)) {
      if (read >= options.maxProducts) {
        return { items, skipped, truncated: true };
      }
      read += 1;
      const mapped = blingProductToItems(await client.getProduct(summary.id));
      items.push(...mapped.items);
      skipped.push(...mapped.skipped);
    }
    if (summaries.length < BLING_PAGE_LIMIT) {
      return { items, skipped, truncated: false };
    }
  }
}
