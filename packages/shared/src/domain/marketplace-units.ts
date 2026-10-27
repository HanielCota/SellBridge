import { configurationError, validationError } from "../runtime/errors.ts";
import type { Marketplace } from "../schemas/stores.ts";

/**
 * Units a Shopee listing shows on top of the real ones. The site owner says Shopee only boosts
 * listings from 1,000 units up; an order beyond the real stock goes to support, never to an
 * automatic cancellation. Units of product, never money.
 */
export const SHOPEE_SHOWCASE_DEFAULT_UNITS = 1000;
export const SHOPEE_SHOWCASE_MAX_UNITS = 100_000;

/**
 * The most units ever sent: the largest value of the integer stock columns (`synced_stock`).
 * A shelf count near it plus the showcase made Postgres fail the whole sync batch with
 * "integer out of range" (MVP-2 review, limits audit).
 */
export const MAX_SENT_UNITS = 2_147_483_647;

/**
 * The validated showcase (SHOPEE_SHOWCASE_UNITS): a whole number from 0 to the maximum. It is
 * also inlined into SQL, so anything else is refused, never rounded.
 */
export function showcaseMargin(showcaseUnits: number): number {
  const isValid =
    Number.isInteger(showcaseUnits) &&
    showcaseUnits >= 0 &&
    showcaseUnits <= SHOPEE_SHOWCASE_MAX_UNITS;
  if (!isValid) {
    throw configurationError(
      `Invalid SHOPEE_SHOWCASE_UNITS: got ${showcaseUnits}, expected a whole number from 0 to ${SHOPEE_SHOWCASE_MAX_UNITS}.`,
    );
  }
  return showcaseUnits;
}

export interface MarketplaceUnitsInput {
  marketplace: Marketplace;
  /** What can really be sold, after reservations, the safety margin and pauses. */
  realUnits: number;
  showcaseUnits: number;
}

/**
 * The stock SENT to a marketplace. Shopee gets the real units plus the showcase while there is
 * something to sell, and 0 once there is not, so the listing stops selling. Every other
 * marketplace gets the real units. SellBridge screens never use this: they show the real units.
 */
export function marketplaceUnits({
  marketplace,
  realUnits,
  showcaseUnits,
}: MarketplaceUnitsInput): number {
  if (!Number.isInteger(realUnits) || realUnits < 0) {
    throw validationError(
      `Invalid real units for ${marketplace}: got ${realUnits}, expected a whole number of 0 or more.`,
    );
  }
  if (marketplace !== "shopee" || realUnits === 0) {
    return realUnits;
  }
  return Math.min(realUnits + showcaseMargin(showcaseUnits), MAX_SENT_UNITS);
}
