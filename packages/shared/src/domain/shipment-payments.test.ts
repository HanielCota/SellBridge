import { describe, expect, test } from "vitest";
import {
  DEFAULT_PAYMENT_FEE_BASIS_POINTS,
  effectivePaymentFeeBasisPoints,
  InvalidPaymentFeeError,
  platformFeeCents,
  shipmentPaymentStatusFrom,
  supplierPaymentBadge,
  supplierPaymentRefundDueAt,
  supplierPaymentRefundReason,
} from "./shipment-payments.ts";
import type { ShipmentTiming } from "./shipment-delay.ts";

describe("effectivePaymentFeeBasisPoints", () => {
  test("uses 1% while the admin has saved no fee", () => {
    const fee = effectivePaymentFeeBasisPoints(null);

    expect(fee).toBe(100);
    expect(fee).toBe(DEFAULT_PAYMENT_FEE_BASIS_POINTS);
  });

  test("uses the fee the admin saved, zero included", () => {
    const saved = effectivePaymentFeeBasisPoints(450);
    const free = effectivePaymentFeeBasisPoints(0);

    expect(saved).toBe(450);
    expect(free).toBe(0);
  });
});

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

function timing(overrides: Partial<ShipmentTiming> = {}): ShipmentTiming {
  return {
    status: "accepted",
    dispatchDeadlineAt: null,
    estimatedDeliveryAt: null,
    shippedAt: null,
    forwardedAt: new Date("2026-11-10T12:00:00.000Z"),
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    ...overrides,
  };
}

describe("supplierPaymentRefundDueAt", () => {
  test("gives a day after the end of Mercado Livre's posting date", () => {
    // Mercado Livre dates the deadline at midnight in Brazil: the whole 13th is still on time.
    const parcel = timing({ dispatchDeadlineAt: new Date("2026-11-13T03:00:00.000Z") });

    const due = supplierPaymentRefundDueAt(parcel, new Date("2026-11-10T12:00:00.000Z"));

    expect(due.toISOString()).toBe("2026-11-15T03:00:00.000Z");
  });

  test("gives a day after the supplier's own dispatch time when the marketplace set none", () => {
    const due = supplierPaymentRefundDueAt(timing(), new Date("2026-11-10T12:00:00.000Z"));

    expect(due.toISOString()).toBe("2026-11-13T12:00:00.000Z");
  });

  test("keeps 48 hours after a payment made after the deadline", () => {
    const parcel = timing({ dispatchDeadlineAt: new Date("2026-11-10T03:00:00.000Z") });

    const due = supplierPaymentRefundDueAt(parcel, new Date("2026-11-12T09:00:00.000Z"));

    expect(due.toISOString()).toBe("2026-11-14T09:00:00.000Z");
  });

  test("keeps 48 hours after the payment when the parcel has no deadline at all", () => {
    const parcel = timing({ forwardedAt: null });

    const due = supplierPaymentRefundDueAt(parcel, new Date("2026-11-10T12:00:00.000Z"));

    expect(due.toISOString()).toBe("2026-11-12T12:00:00.000Z");
  });
});

describe("supplierPaymentRefundReason", () => {
  const paidAt = new Date("2026-11-10T12:00:00.000Z");

  test("refunds an unshipped parcel once the refund is due", () => {
    const reason = supplierPaymentRefundReason({
      timing: timing({ status: "ready" }),
      paidAt,
      now: new Date("2026-11-13T12:00:00.000Z"),
    });

    expect(reason).toBe("not_dispatched");
  });

  test("waits while the refund is not due yet", () => {
    const reason = supplierPaymentRefundReason({
      timing: timing({ status: "ready" }),
      paidAt,
      now: new Date("2026-11-13T11:59:59.000Z"),
    });

    expect(reason).toBeNull();
  });

  test("refunds a cancelled parcel at once", () => {
    const reason = supplierPaymentRefundReason({
      timing: timing({ status: "cancelled" }),
      paidAt,
      now: paidAt,
    });

    expect(reason).toBe("cancelled");
  });

  test("refunds a parcel that came back to the supplier", () => {
    const reason = supplierPaymentRefundReason({
      timing: timing({ status: "returned" }),
      paidAt,
      now: paidAt,
    });

    expect(reason).toBe("returned");
  });

  test("never refunds a parcel the carrier failed to deliver", () => {
    const reason = supplierPaymentRefundReason({
      timing: timing({ status: "not_delivered" }),
      paidAt,
      now: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(reason).toBeNull();
  });

  test("never refunds a shipped parcel, however late", () => {
    const reason = supplierPaymentRefundReason({
      timing: timing({ status: "shipped" }),
      paidAt,
      now: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(reason).toBeNull();
  });
});
