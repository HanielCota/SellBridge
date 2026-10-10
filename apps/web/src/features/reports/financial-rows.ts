import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import type { Cents } from "@sellbridge/shared/money";

type OrderCosts = Pick<OrderFinancialRow, "costCents" | "feeCents" | "platformFeeCents">;
type OrderMoneyFlows = Pick<OrderFinancialRow, "commissionCents" | "refundCents" | "returnCents">;

/** What an order cost the reseller (products plus every fee), as a negative amount. */
export function orderCostsCents(row: OrderCosts): Cents {
  const total = row.costCents + row.feeCents + row.platformFeeCents;
  return total === 0 ? 0 : -total;
}

export type OrderAdjustmentKind = "commission" | "refund" | "return";

export interface OrderAdjustment {
  kind: OrderAdjustmentKind;
  cents: Cents;
}

/**
 * Money that moved after the sale, in display order. Empty when commissions and refunds
 * cancel out and nothing came back, so the cell shows a dash instead of noise.
 */
export function orderAdjustments(row: OrderMoneyFlows): readonly OrderAdjustment[] {
  if (row.commissionCents - row.refundCents === 0 && row.returnCents === 0) {
    return [];
  }
  const adjustments: OrderAdjustment[] = [
    { kind: "commission", cents: row.commissionCents },
    { kind: "refund", cents: row.refundCents },
    { kind: "return", cents: row.returnCents },
  ];
  return adjustments.filter((adjustment) => adjustment.cents > 0);
}
