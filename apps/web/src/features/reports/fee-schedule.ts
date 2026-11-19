import { DEFAULT_PRODUCT_WEIGHT_GRAMS, type FeeSchedule } from "@sellbridge/shared/fee-model";
import type { ServerEnvironment } from "@/lib/server/environment-schema";

type FeeEnvironment = Pick<
  ServerEnvironment,
  "ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS" | "MIN_MARGIN_PERCENT"
>;

/**
 * SellBridge's fee on a reseller's sales: none. The fee comes out of the supplier's share when the
 * reseller pays an order (the rate an admin sets in Configurações), so the reseller's previews,
 * financial page, reports and API never subtract it (Guilherme, 17/11/2026).
 */
export const RESELLER_PLATFORM_FEE_BASIS_POINTS = 0;

/**
 * The fee model the previews use, from the server's configuration. It is set on Mercado Livre; a
 * screen or a check moves it to a store's channel with `onChannel`. Category rates stay empty
 * until the real ones are read from the marketplace (see docs/decisions.md).
 */
export function feeScheduleFrom(environment: FeeEnvironment): FeeSchedule {
  return {
    channel: "mercado_livre",
    marketplaceFeeBasisPoints: environment.ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS,
    categoryFeeBasisPoints: {},
    platformFeeBasisPoints: RESELLER_PLATFORM_FEE_BASIS_POINTS,
    defaultWeightGrams: DEFAULT_PRODUCT_WEIGHT_GRAMS,
    minimumMarginPercent: environment.MIN_MARGIN_PERCENT,
  };
}
