import { describe, expect, it } from "vitest";
import { presentFinancialSummary } from "./financials.presenter";

describe("presentFinancialSummary", () => {
  it("returns the period and the totals in cents", () => {
    const dto = presentFinancialSummary(
      {
        orders: 2,
        cancelledOrders: 1,
        revenueCents: 20_000,
        costCents: 8000,
        feeCents: 2800,
        refundCents: 0,
        returnCents: 5000,
        commissionCents: 300,
        platformFeeCents: 500,
        profitCents: 9000,
        pendingCostOrders: 1,
        pendingCostRevenueCents: 4000,
        averageTicketCents: 10_000,
      },
      { fromDate: "2026-03-01", toDate: "2026-03-07" },
    );
    expect(dto).toEqual({
      period: { from: "2026-03-01", to: "2026-03-07" },
      orders: 2,
      cancelledOrders: 1,
      pendingCostOrders: 1,
      averageTicketCents: 10_000,
      totals: {
        revenueCents: 20_000,
        costCents: 8000,
        marketplaceFeeCents: 2800,
        refundsCents: 0,
        returnsCents: 5000,
        commissionsCents: 300,
        platformFeeCents: 500,
        profitCents: 9000,
        pendingCostRevenueCents: 4000,
      },
    });
  });
});
