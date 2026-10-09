import { describe, expect, it } from "vitest";
import { computeOrderFinance, type OrderFinanceInput } from "./finance.ts";

const base: OrderFinanceInput = {
  status: "delivered",
  totalCents: 10_000,
  marketplaceFeeCents: 1400,
  items: [{ quantity: 2, unitCostCents: 2500 }],
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
});
