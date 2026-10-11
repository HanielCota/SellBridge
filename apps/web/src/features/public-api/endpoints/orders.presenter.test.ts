import type { OrderDetail, OrderFinancialRow } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { presentOrderDetail, presentOrderSummary } from "./orders.presenter";

const detail: OrderDetail = {
  id: "order-1",
  externalOrderId: "ML-1",
  storeConnectionId: "store-1",
  storeName: "Loja da Ana",
  status: "delivered",
  totalCents: 10_000,
  marketplaceFeeCents: 1400,
  buyerName: "Mariana",
  orderedAt: new Date("2026-03-01T13:00:00Z"),
  deliveredAt: new Date("2026-03-04T15:00:00Z"),
  items: [
    {
      id: "item-1",
      title: "Vestido",
      quantity: 2,
      unitPriceCents: 5000,
      unitCostCents: 2000,
      listingId: "listing-1",
      productId: "product-1",
    },
  ],
  adjustments: [
    {
      id: "adjustment-1",
      type: "commission",
      amountCents: 300,
      reason: null,
      createdAt: new Date("2026-03-05T10:00:00Z"),
    },
  ],
};

describe("presentOrderDetail", () => {
  it("computes the totals with the reports' formula", () => {
    // 10000 − 4000 − 1400 + 300 − 250 (2.5% platform fee) = 4650
    expect(presentOrderDetail(detail, 250).totals).toEqual({
      revenueCents: 10_000,
      costCents: 4000,
      marketplaceFeeCents: 1400,
      refundsCents: 0,
      returnsCents: 0,
      commissionsCents: 300,
      platformFeeCents: 250,
      profitCents: 4650,
    });
  });

  it("names the store and dates everything in ISO", () => {
    const dto = presentOrderDetail(detail, 0);
    expect(dto).toMatchObject({
      storeId: "store-1",
      orderedAt: "2026-03-01T13:00:00.000Z",
      deliveredAt: "2026-03-04T15:00:00.000Z",
    });
    expect(dto.adjustments[0]?.createdAt).toBe("2026-03-05T10:00:00.000Z");
    expect(dto.items[0]).toEqual(detail.items[0]);
  });

  it("counts no revenue for a cancelled order", () => {
    const cancelled = presentOrderDetail({ ...detail, status: "cancelled", adjustments: [] }, 250);
    expect(cancelled.totals).toMatchObject({ revenueCents: 0, costCents: 0, profitCents: 0 });
  });
});

describe("presentOrderSummary", () => {
  const row: OrderFinancialRow = {
    id: "order-1",
    externalOrderId: "ML-1",
    orderedAt: new Date("2026-03-01T13:00:00Z"),
    deliveredAt: null,
    status: "paid",
    storeConnectionId: "store-1",
    storeName: "Loja da Ana",
    buyerName: null,
    items: "Vestido (x2)",
    revenueCents: 10_000,
    costCents: 4000,
    feeCents: 1400,
    refundCents: 100,
    returnCents: 0,
    commissionCents: 0,
    platformFeeCents: 250,
    profitCents: 4250,
    product: null,
  };

  it("renames the report fields to the public ones", () => {
    expect(presentOrderSummary(row)).toMatchObject({
      storeId: "store-1",
      status: "paid",
      deliveredAt: null,
      itemsSummary: "Vestido (x2)",
      totals: { marketplaceFeeCents: 1400, refundsCents: 100, profitCents: 4250 },
    });
  });

  it("fails loudly on a status the API does not know", () => {
    expect(() => presentOrderSummary({ ...row, status: "lost" })).toThrow(ZodError);
  });
});
