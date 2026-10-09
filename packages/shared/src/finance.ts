import { percentOfCents, type Cents } from "./money.ts";

export type FinanceOrderStatus =
  "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "returned";

/** Orders that do not generate revenue: cancelled before shipping or returned by the buyer. */
export const NON_REVENUE_STATUSES: readonly FinanceOrderStatus[] = ["cancelled", "returned"];

export interface OrderFinanceInput {
  status: FinanceOrderStatus;
  totalCents: Cents;
  marketplaceFeeCents: Cents;
  items: readonly { quantity: number; unitCostCents: Cents }[];
  adjustments: readonly { type: "refund" | "return" | "commission"; amountCents: Cents }[];
}

export interface OrderFinance {
  revenueCents: Cents;
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

/**
 * Profit of one order (all values in cents):
 *   revenue − supplier cost − marketplace fee − refunds + supplier commissions − platform fee
 * Cancelled and returned orders contribute no revenue, cost or fee (the product goes back
 * to the supplier); the returned amount is reported separately for visibility.
 * The SQL in packages/db/src/repositories/reports.ts mirrors this function.
 */
export function computeOrderFinance(
  input: OrderFinanceInput,
  platformFeeBps: number,
): OrderFinance {
  const counted = !NON_REVENUE_STATUSES.includes(input.status);
  const revenueCents = counted ? input.totalCents : 0;
  const costCents = counted
    ? input.items.reduce((total, item) => total + item.unitCostCents * item.quantity, 0)
    : 0;
  const feeCents = counted ? input.marketplaceFeeCents : 0;
  const refundCents = sumAdjustments(input, "refund");
  const returnCents = sumAdjustments(input, "return");
  const commissionCents = sumAdjustments(input, "commission");
  const platformFeeCents = percentOfCents(revenueCents, platformFeeBps);
  const profitCents =
    revenueCents - costCents - feeCents - refundCents + commissionCents - platformFeeCents;
  return {
    revenueCents,
    costCents,
    feeCents,
    refundCents,
    returnCents,
    commissionCents,
    platformFeeCents,
    profitCents,
  };
}
