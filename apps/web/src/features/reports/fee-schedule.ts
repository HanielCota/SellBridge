import type { FeeSchedule } from "@sellbridge/shared/fee-model";
import type { ServerEnvironment } from "@/lib/server/environment-schema";

type FeeEnvironment = Pick<
  ServerEnvironment,
  | "ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS"
  | "PLATFORM_FEE_BASIS_POINTS"
  | "ESTIMATED_SHIPPING_CENTS"
  | "MIN_MARGIN_PERCENT"
>;

/**
 * The fee model the previews use, from the server's configuration: the same platform fee the
 * financial report charges. Category rates stay empty until the real ones are read from the
 * marketplace (see docs/decisions.md).
 */
export function feeScheduleFrom(environment: FeeEnvironment): FeeSchedule {
  return {
    marketplaceFeeBasisPoints: environment.ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS,
    categoryFeeBasisPoints: {},
    platformFeeBasisPoints: environment.PLATFORM_FEE_BASIS_POINTS,
    estimatedShippingCents: environment.ESTIMATED_SHIPPING_CENTS,
    minimumMarginPercent: environment.MIN_MARGIN_PERCENT,
  };
}
