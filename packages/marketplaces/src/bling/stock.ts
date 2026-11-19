import { logger } from "@sellbridge/shared/logger";
import {
  BLING_PAGE_LIMIT,
  BLING_STOCK_BATCH_LIMIT,
  type BlingClient,
  type BlingStockFilter,
} from "./client.ts";
import type { BlingStockBalance } from "./schemas.ts";

/** Largest stock a product row holds (Postgres `integer`). */
const MAX_STOCK_UNITS = 2_147_483_647;

/**
 * Bling answers only the products whose balance matches `filtroSaldoEstoque`, positive by
 * default: the ones missing from a positive read are asked again as zero, then as negative.
 */
const FILTERS_IN_ORDER: readonly BlingStockFilter[] = [1, 0, 2];

export interface BlingStockReading {
  readonly erpProductId: number;
  readonly sku: string | null;
  /** Whole sellable units: Bling's virtual balance (stock minus its own reservations). */
  readonly stock: number;
}

export interface BlingStockRead {
  readonly readings: BlingStockReading[];
  /** Ids Bling answered under no filter: the product is no longer in that account. */
  readonly missing: number[];
}

/**
 * Whole units SellBridge can offer from Bling's virtual balance: fractions round down and a
 * negative balance is zero. Null when Bling sent no usable number.
 */
export function blingStockUnits(virtualBalance: number | null | undefined): number | null {
  if (virtualBalance === null || virtualBalance === undefined) {
    return null;
  }
  if (!Number.isFinite(virtualBalance)) {
    return null;
  }
  return Math.min(MAX_STOCK_UNITS, Math.max(0, Math.floor(virtualBalance)));
}

function chunks<Item>(items: readonly Item[], size: number): Item[][] {
  const result: Item[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

function readingOf(balance: BlingStockBalance): BlingStockReading | null {
  const stock = blingStockUnits(balance.saldoVirtualTotal);
  if (stock === null) {
    logger.warn("bling.stock_balance_unusable", { erpProductId: balance.produto.id });
    return null;
  }
  return { erpProductId: balance.produto.id, sku: balance.produto.codigo ?? null, stock };
}

async function readBatch(client: BlingClient, ids: readonly number[]): Promise<BlingStockRead> {
  const readings: BlingStockReading[] = [];
  const answered = new Set<number>();
  let pending = [...new Set(ids)];
  for (const filter of FILTERS_IN_ORDER) {
    if (pending.length === 0) {
      break;
    }
    const balances = await client.readStockBalances(pending, filter);
    for (const balance of balances) {
      if (answered.has(balance.produto.id)) {
        continue;
      }
      answered.add(balance.produto.id);
      const reading = readingOf(balance);
      if (reading !== null) {
        readings.push(reading);
      }
    }
    pending = pending.filter((id) => !answered.has(id));
  }
  return { readings, missing: pending };
}

/** Reads the current balance of these Bling products, 100 per request. */
export async function readBlingStock(
  client: BlingClient,
  productIds: readonly number[],
): Promise<BlingStockRead> {
  const readings: BlingStockReading[] = [];
  const missing: number[] = [];
  for (const batch of chunks(productIds, BLING_STOCK_BATCH_LIMIT)) {
    const read = await readBatch(client, batch);
    readings.push(...read.readings);
    missing.push(...read.missing);
  }
  return { readings, missing };
}

/**
 * The Bling id of each SKU found in the account, 100 SKUs per request. A code Bling holds on two
 * products is left out: SellBridge cannot tell which one is the supplier's.
 */
export async function findBlingIdsBySku(
  client: BlingClient,
  skus: readonly string[],
): Promise<{ sku: string; erpProductId: number }[]> {
  const links: { sku: string; erpProductId: number }[] = [];
  for (const batch of chunks(skus, BLING_PAGE_LIMIT)) {
    const found = await client.findProductsByCodes(batch);
    const idsByCode = new Map<string, number[]>();
    for (const product of found) {
      const code = product.codigo ?? "";
      if (code !== "") {
        idsByCode.set(code, [...(idsByCode.get(code) ?? []), product.id]);
      }
    }
    for (const sku of batch) {
      const ids = idsByCode.get(sku) ?? [];
      const only = ids.length === 1 ? ids[0] : undefined;
      if (only !== undefined) {
        links.push({ sku, erpProductId: only });
      }
    }
  }
  return links;
}
