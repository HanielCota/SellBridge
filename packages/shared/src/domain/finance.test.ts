import { describe, expect, it } from "vitest";
import { computeOrderFinance, type OrderFinanceInput } from "./finance.ts";

const base: OrderFinanceInput = {
  status: "delivered",
  totalCents: 10_000,
  marketplaceFeeCents: 1400,
  items: [{ quantity: 2, knownUnitCostCents: 2500 }],
  adjustments: [],
};

describe("computeOrderFinance", () => {
  it("subtracts supplier cost and marketplace fee from revenue", () => {
    expect(computeOrderFinance(base, 0)).toMatchObject({
      revenueCents: 10_000,
      costCents: 5000,
      feeCents: 1400,
      profitCents: 3600,
    });
  });

  it("applies refunds, commissions and the platform fee", () => {
    const result = computeOrderFinance(
      {
        ...base,
        adjustments: [
          { type: "refund", amountCents: 1000 },
          { type: "commission", amountCents: 300 },
        ],
      },
      500,
    );
    expect(result).toMatchObject({
      refundCents: 1000,
      commissionCents: 300,
      platformFeeCents: 500,
    });
    expect(result.profitCents).toBe(10_000 - 5000 - 1400 - 1000 + 300 - 500);
  });

  it.each(["cancelled", "returned"] as const)(
    "ignores revenue and costs of %s orders",
    (status) => {
      const result = computeOrderFinance(
        {
          ...base,
          status,
          adjustments: status === "returned" ? [{ type: "return", amountCents: 10_000 }] : [],
        },
        500,
      );
      expect(result).toMatchObject({
        revenueCents: 0,
        costCents: 0,
        feeCents: 0,
        platformFeeCents: 0,
        profitCents: 0,
      });
      expect(result.returnCents).toBe(status === "returned" ? 10_000 : 0);
    },
  );

  it("handles orders without items", () => {
    expect(computeOrderFinance({ ...base, items: [] }, 0).costCents).toBe(0);
  });

  it("counts a sale with an item of unknown cost as revenue but keeps it out of the profit", () => {
    const result = computeOrderFinance(
      {
        ...base,
        items: [
          { quantity: 2, knownUnitCostCents: 2500 },
          { quantity: 1, knownUnitCostCents: null },
        ],
        adjustments: [
          { type: "refund", amountCents: 1000 },
          { type: "commission", amountCents: 300 },
        ],
      },
      500,
    );
    expect(result).toEqual({
      costPending: true,
      revenueCents: 10_000,
      pendingCostRevenueCents: 10_000,
      costCents: 0,
      feeCents: 0,
      refundCents: 0,
      returnCents: 0,
      commissionCents: 0,
      platformFeeCents: 0,
      profitCents: 0,
    });
  });

  it("does not mark the cost pending on orders that are not sales", () => {
    const result = computeOrderFinance(
      { ...base, status: "pending", items: [{ quantity: 1, knownUnitCostCents: null }] },
      500,
    );
    expect(result).toMatchObject({
      costPending: false,
      revenueCents: 0,
      pendingCostRevenueCents: 0,
      profitCents: 0,
    });
  });

  it("reports known costs as not pending", () => {
    expect(computeOrderFinance(base, 0)).toMatchObject({
      costPending: false,
      pendingCostRevenueCents: 0,
    });
  });
});
