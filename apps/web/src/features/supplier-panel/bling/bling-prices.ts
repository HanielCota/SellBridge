import type { ErpImportRow, ErpResellerCost } from "@sellbridge/shared/erp-catalog";
import { resellerPriceFromDiscount } from "@sellbridge/shared/erp-reseller-price";
import { parseBrlToCents } from "@sellbridge/shared/money";
import { formatCentsForField } from "@/lib/currency-mask";

/** The reseller price typed for each new product, by SKU, as the field shows it ("24,90"). */
export type TypedPrices = ReadonlyMap<string, string>;

/**
 * Fills every new product that has an ERP price with the discount rule, replacing what was
 * there: the supplier asked for one rule for all. A product without an ERP price keeps its field.
 */
export function pricesFromDiscount(
  rows: readonly ErpImportRow[],
  typed: TypedPrices,
  tenths: number,
): Map<string, string> {
  const next = new Map(typed);
  for (const row of rows) {
    if (!row.needsCost) {
      continue;
    }
    const cents = resellerPriceFromDiscount(row.erpPriceCents, tenths);
    if (cents !== null) {
      next.set(row.sku, formatCentsForField(cents));
    }
  }
  return next;
}

/** The typed price in cents, or null when the field is empty or not a positive amount. */
export function typedCents(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") {
    return null;
  }
  const cents = parseBrlToCents(text);
  if (cents === null || cents <= 0) {
    return null;
  }
  return cents;
}

export interface PricedImport {
  /** Prices for the new products that have one, ready for `supplierBlingImport`. */
  readonly costs: ErpResellerCost[];
  /** New products still without a valid price; the import waits for zero. */
  readonly missing: number;
}

export function pricedImport(rows: readonly ErpImportRow[], typed: TypedPrices): PricedImport {
  const costs: ErpResellerCost[] = [];
  let missing = 0;
  for (const row of rows) {
    if (!row.needsCost) {
      continue;
    }
    const cents = typedCents(typed.get(row.sku));
    if (cents === null) {
      missing += 1;
      continue;
    }
    costs.push({ sku: row.sku, costCents: cents });
  }
  return { costs, missing };
}
