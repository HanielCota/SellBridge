import { percentOfCents, type Cents } from "./money.ts";

/** Typical marketplace commission, used for estimates before a real order reports its fee. */
export const ESTIMATED_MARKETPLACE_FEE_BPS = 1400;

export type FinanceOrderStatus =
  "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "returned";

/**
 * Orders that do not generate revenue: not paid yet (awaiting payment, or held by the
 * marketplace's fraud check), cancelled before shipping, or returned by the buyer.
 */
const NON_REVENUE_STATUSES: readonly FinanceOrderStatus[] = ["pending", "cancelled", "returned"];

export interface OrderFinanceInput {
  status: FinanceOrderStatus;
  totalCents: Cents;
  marketplaceFeeCents: Cents;
  /**
   * Null when the item's listing is not ours, so its supplier cost is unknown. Named apart from
   * the stored `unitCostCents` (zero for those items) so a stored row cannot be passed by mistake.
   */
  items: readonly { quantity: number; knownUnitCostCents: Cents | null }[];
  adjustments: readonly { type: "refund" | "return" | "commission"; amountCents: Cents }[];
}

export interface OrderFinance {
  /** A sale with an item of unknown cost: its revenue counts, but nothing of it enters the profit. */
  costPending: boolean;
  revenueCents: Cents;
  /** The revenue of a cost-pending sale (zero otherwise): part of the revenue, left out of the profit. */
  pendingCostRevenueCents: Cents;
  costCents: Cents;
  feeCents: Cents;
  refundCents: Cents;
  returnCents: Cents;
  commissionCents: Cents;
  platformFeeCents: Cents;
  profitCents: Cents;
}

function sumAdjustments(input: OrderFinanceInput, type: "refund" | "return" | "commission"): Cents {
  return input.adjustments
    .filter((adjustment) => adjustment.type === type)
    .reduce((total, adjustment) => total + adjustment.amountCents, 0);
}

/** What a sale left out of the profit adds up to: only its revenue, set apart. */
function pendingCostFinance(revenueCents: Cents): OrderFinance {
  return {
    costPending: true,
    revenueCents,
    pendingCostRevenueCents: revenueCents,
    costCents: 0,
    feeCents: 0,
    refundCents: 0,
    returnCents: 0,
    commissionCents: 0,
    platformFeeCents: 0,
    profitCents: 0,
  };
}

/**
 * Profit of one order (all values in cents):
 *   revenue − supplier cost − marketplace fee − refunds + supplier commissions − platform fee
 * Cancelled and returned orders contribute no revenue, cost or fee (the product goes back
 * to the supplier); the returned amount is reported separately for visibility.
 * A sale with an item of unknown cost ("custo pendente") keeps its revenue but stays out of the
 * profit entirely: counting that item at zero cost would inflate the profit.
 * The SQL in packages/database/src/repositories/reports.ts mirrors this function.
 */
export function computeOrderFinance(
  input: OrderFinanceInput,
  platformFeeBasisPoints: number,
): OrderFinance {
  const counted = !NON_REVENUE_STATUSES.includes(input.status);
  if (counted && input.items.some((item) => item.knownUnitCostCents === null)) {
    return pendingCostFinance(input.totalCents);
  }
  const revenueCents = counted ? input.totalCents : 0;
  const costCents = counted
    ? input.items.reduce((total, item) => total + (item.knownUnitCostCents ?? 0) * item.quantity, 0)
    : 0;
  const feeCents = counted ? input.marketplaceFeeCents : 0;
  const refundCents = sumAdjustments(input, "refund");
  const returnCents = sumAdjustments(input, "return");
  const commissionCents = sumAdjustments(input, "commission");
  const platformFeeCents = percentOfCents(revenueCents, platformFeeBasisPoints);
  const profitCents =
    revenueCents - costCents - feeCents - refundCents + commissionCents - platformFeeCents;
  return {
    costPending: false,
    revenueCents,
    pendingCostRevenueCents: 0,
    costCents,
    feeCents,
    refundCents,
    returnCents,
    commissionCents,
    platformFeeCents,
    profitCents,
  };
}
