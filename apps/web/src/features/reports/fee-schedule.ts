import { DEFAULT_PRODUCT_WEIGHT_GRAMS, type FeeSchedule } from "@sellbridge/shared/fee-model";
import type { ServerEnvironment } from "@/lib/server/environment-schema";

type FeeEnvironment = Pick<
  ServerEnvironment,
  "ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS" | "MIN_MARGIN_PERCENT"
>;

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
    defaultWeightGrams: DEFAULT_PRODUCT_WEIGHT_GRAMS,
    minimumMarginPercent: environment.MIN_MARGIN_PERCENT,
  };
}
