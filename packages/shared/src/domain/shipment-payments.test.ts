import { describe, expect, test } from "vitest";
import {
  InvalidPaymentFeeError,
  platformFeeCents,
  shipmentPaymentStatusFrom,
  supplierPaymentBadge,
} from "./shipment-payments.ts";

describe("platformFeeCents", () => {
  test("takes the rate of the amount", () => {
    const fee = platformFeeCents(10_000, 500);

    expect(fee).toBe(500);
  });

  test("rounds half a cent up", () => {
    const fee = platformFeeCents(5990, 250);

    expect(fee).toBe(150);
  });

  test("is zero when the rate is zero", () => {
    const fee = platformFeeCents(5990, 0);

    expect(fee).toBe(0);
  });

  test("accepts the highest rate", () => {
    const fee = platformFeeCents(1000, 3000);

    expect(fee).toBe(300);
  });

  test("throws InvalidPaymentFeeError when the rate is above 30%", () => {
    expect(() => platformFeeCents(1000, 3001)).toThrow(InvalidPaymentFeeError);
  });

  test("throws InvalidPaymentFeeError when the rate is negative", () => {
    expect(() => platformFeeCents(1000, -1)).toThrow(InvalidPaymentFeeError);
  });

  test("throws InvalidPaymentFeeError when the amount is zero", () => {
    expect(() => platformFeeCents(0, 500)).toThrow(InvalidPaymentFeeError);
  });

  test("throws InvalidPaymentFeeError when the amount is not finite", () => {
    expect(() => platformFeeCents(Number.NaN, 500)).toThrow(InvalidPaymentFeeError);
  });
});

describe("shipmentPaymentStatusFrom", () => {
  test("keeps a known status", () => {
    expect(shipmentPaymentStatusFrom("approved")).toBe("approved");
  });

  test("treats an authorized payment as in process", () => {
    expect(shipmentPaymentStatusFrom("authorized")).toBe("in_process");
  });

  test("keeps an unknown status pending, never paid", () => {
    expect(shipmentPaymentStatusFrom("something_new")).toBe("pending");
  });
});

describe("supplierPaymentBadge", () => {
  const paidAt = "2026-11-10T17:32:00.000Z";

  test("shows paid with the date once approved", () => {
    const badge = supplierPaymentBadge({
      payment: { status: "approved", paidAt, method: "pix" },
      supplierReceivesHere: true,
    });

    expect(badge).toEqual({ kind: "paid", paidAt, method: "pix" });
  });

  test("stays paid after the supplier unlinks the account", () => {
    const badge = supplierPaymentBadge({
      payment: { status: "approved", paidAt, method: "pix" },
      supplierReceivesHere: false,
    });

    expect(badge.kind).toBe("paid");
  });

  test("waits while the supplier receives here and nothing was paid", () => {
    const badge = supplierPaymentBadge({
      payment: { status: "rejected", paidAt: null, method: null },
      supplierReceivesHere: true,
    });

    expect(badge).toEqual({ kind: "waiting" });
  });

  test("shows refunded after a refund", () => {
    const badge = supplierPaymentBadge({
      payment: { status: "refunded", paidAt, method: "pix" },
      supplierReceivesHere: true,
    });

    expect(badge).toEqual({ kind: "refunded" });
  });

  test("is paid outside when the supplier has no account here", () => {
    const badge = supplierPaymentBadge({ payment: null, supplierReceivesHere: false });

    expect(badge).toEqual({ kind: "outside" });
  });
});
