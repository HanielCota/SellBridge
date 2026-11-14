/**
 * How "hot" a supplier product is: units sold in the last days across every SellBridge store.
 * No marketplace-wide data exists, so this is SellBridge's own sales only, never per reseller.
 */
export const PRODUCT_HEAT_WINDOW_IN_DAYS = 30;

/**
 * Units in the window where each level starts. With no market data yet, the cut is by pace:
 * under 5 is less than about one sale a week, 20 or more is close to one sale every day.
 */
export const PRODUCT_HEAT_THRESHOLDS = {
  warmFromUnits: 5,
  hotFromUnits: 20,
} as const;

export type ProductHeatLevel = "none" | "cold" | "warm" | "hot";

export class InvalidUnitsSoldError extends Error {
  constructor(unitsSold: number) {
    super(`Units sold must be a non-negative integer, got ${String(unitsSold)}`);
    this.name = "InvalidUnitsSoldError";
  }
}

/**
 * The heat level for the units sold in the window.
 *
 * @throws {InvalidUnitsSoldError} When the units are negative, fractional, NaN or infinite.
 */
export function productHeatLevel(unitsSold: number): ProductHeatLevel {
  if (!Number.isInteger(unitsSold) || unitsSold < 0) {
    throw new InvalidUnitsSoldError(unitsSold);
  }
  if (unitsSold === 0) {
    return "none";
  }
  if (unitsSold >= PRODUCT_HEAT_THRESHOLDS.hotFromUnits) {
    return "hot";
  }
  if (unitsSold >= PRODUCT_HEAT_THRESHOLDS.warmFromUnits) {
    return "warm";
  }
  return "cold";
}
