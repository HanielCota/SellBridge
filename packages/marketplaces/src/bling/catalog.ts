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

export interface BlingCatalogProgress {
  /** Products (parents) whose detail was read so far. */
  readonly read: number;
  /** Products to read in this run (capped at `maxProducts`). */
  readonly total: number;
}

export interface BlingCatalogReadOptions {
  /** Parents read at most; the rest is left out and `truncated` says so. */
  readonly maxProducts: number;
  /** Items (variations count one each) kept at most, so a stored read stays bounded. */
  readonly maxItems?: number;
  readonly onProgress?: (progress: BlingCatalogProgress) => Promise<void>;
}

/** The top-level product ids, walking the list until it ends or passes `maxProducts`. */
async function listTopLevelIds(client: BlingClient, maxProducts: number) {
  const ids: number[] = [];
  for (let page = 1; ; page += 1) {
    const summaries = await client.listProducts({ page });
    ids.push(...summaries.filter(isTopLevel).map((summary) => summary.id));
    if (ids.length > maxProducts) {
      return { ids: ids.slice(0, maxProducts), truncated: true };
    }
    if (summaries.length < BLING_PAGE_LIMIT) {
      return { ids, truncated: false };
    }
  }
}

/**
 * The import takes one row per SKU, so a code Bling repeats keeps its first product; the others
 * are listed as left out, with the reason.
 */
function withoutRepeatedCodes(
  items: readonly ErpCatalogItem[],
  seen: Set<string>,
): { unique: ErpCatalogItem[]; repeated: SkippedBlingProduct[] } {
  const unique: ErpCatalogItem[] = [];
  const repeated: SkippedBlingProduct[] = [];
  for (const item of items) {
    if (seen.has(item.sku)) {
      repeated.push({
        name: item.title,
        reason: `Código ${item.sku} repetido em outro produto do Bling`,
      });
      continue;
    }
    seen.add(item.sku);
    unique.push(item);
  }
  return { unique, repeated };
}

/**
 * Reads the account's active products: first the summary list (to know how many there are),
 * then each product's detail (NCM, weight and images only come there), reporting progress after
 * each one. At 3 requests per second, 400 products take a little over two minutes.
 */
export async function readBlingCatalog(
  client: BlingClient,
  options: BlingCatalogReadOptions,
): Promise<BlingCatalogRead> {
  const listed = await listTopLevelIds(client, options.maxProducts);
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  const items: ErpCatalogItem[] = [];
  const skipped: SkippedBlingProduct[] = [];
  const seenCodes = new Set<string>();
  for (const [index, id] of listed.ids.entries()) {
    const mapped = blingProductToItems(await client.getProduct(id));
    const { unique, repeated } = withoutRepeatedCodes(mapped.items, seenCodes);
    if (items.length + unique.length > maxItems) {
      return { items, skipped, truncated: true };
    }
    items.push(...unique);
    skipped.push(...mapped.skipped, ...repeated);
    await options.onProgress?.({ read: index + 1, total: listed.ids.length });
  }
  return { items, skipped, truncated: listed.truncated };
}
