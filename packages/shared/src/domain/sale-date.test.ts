import { describe, expect, it } from "vitest";
import { paidAtOfKnownOrder, paidAtOfNewOrder } from "./sale-date.ts";

// 2 Nov 2026, 10:00 in Brazil.
const NOW = new Date("2026-11-02T13:00:00.000Z");

describe("paidAtOfNewOrder", () => {
  it("dates a paid order of the current month by its order date", () => {
    const orderedAt = new Date("2026-11-01T15:00:00.000Z");

    const paidAt = paidAtOfNewOrder({ status: "paid", orderedAt, now: NOW });

    expect(paidAt).toEqual(orderedAt);
  });

  it("dates a paid order of a closed month by when it was seen", () => {
    // 31 Oct 2026, 23:58 in Brazil: October is over when the sync sees it.
    const orderedAt = new Date("2026-11-01T02:58:00.000Z");

    const paidAt = paidAtOfNewOrder({ status: "shipped", orderedAt, now: NOW });

    expect(paidAt).toEqual(NOW);
  });

  it("keeps an order awaiting payment without a payment date", () => {
    const paidAt = paidAtOfNewOrder({ status: "pending", orderedAt: NOW, now: NOW });

    expect(paidAt).toBeNull();
  });

  it("keeps a cancelled order without a payment date", () => {
    const paidAt = paidAtOfNewOrder({ status: "cancelled", orderedAt: NOW, now: NOW });

    expect(paidAt).toBeNull();
  });

  it("dates a returned order, which the buyer had paid", () => {
    const paidAt = paidAtOfNewOrder({ status: "returned", orderedAt: NOW, now: NOW });

    expect(paidAt).toEqual(NOW);
  });
});

describe("paidAtOfKnownOrder", () => {
  it("dates the payment when an unpaid order is first seen paid", () => {
    const paidAt = paidAtOfKnownOrder({ paidAt: null, status: "paid", now: NOW });

    expect(paidAt).toEqual(NOW);
  });

  it("keeps the first payment date on later syncs", () => {
    const first = new Date("2026-10-30T12:00:00.000Z");

    const paidAt = paidAtOfKnownOrder({ paidAt: first, status: "cancelled", now: NOW });

    expect(paidAt).toEqual(first);
  });

  it("leaves an order still awaiting payment without a payment date", () => {
    const paidAt = paidAtOfKnownOrder({ paidAt: null, status: "pending", now: NOW });

    expect(paidAt).toBeNull();
  });
});
