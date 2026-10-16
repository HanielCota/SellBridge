import { describe, expect, it } from "vitest";
import {
  acceptOutcome,
  dispatchOutcome,
  tallyCancellations,
  tallyRatings,
  type ShipmentHealthRecord,
} from "./supplier-panel-health-outcomes.ts";

const HOUR = 3_600_000;
const FORWARDED_AT = new Date("2026-10-10T12:00:00Z");

function record(overrides: Partial<ShipmentHealthRecord> = {}): ShipmentHealthRecord {
  return {
    shipmentId: "shipment",
    orderId: "order",
    externalOrderId: "ML-1",
    status: "forwarded",
    dispatchDeadlineAt: null,
    estimatedDeliveryAt: null,
    forwardedAt: FORWARDED_AT,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    acceptedAt: null,
    shippedAt: null,
    cancelledBySupplier: false,
    ...overrides,
  };
}

function after(hours: number): Date {
  return new Date(FORWARDED_AT.getTime() + hours * HOUR);
}

describe("acceptOutcome", () => {
  it("is on time up to the last instant before the accept time", () => {
    expect(acceptOutcome(record({ acceptedAt: after(23.9) }), after(30))).toBe("on_time");
    expect(acceptOutcome(record({ acceptedAt: after(24) }), after(30))).toBe("late");
  });

  it("waits while the accept time is still ahead and turns late once it passes", () => {
    expect(acceptOutcome(record(), after(23))).toBe("pending");
    expect(acceptOutcome(record(), after(24))).toBe("late");
  });

  it("ignores a cancellation that was not the supplier's", () => {
    expect(acceptOutcome(record({ status: "cancelled" }), after(100))).toBe("pending");
  });

  it("leaves a supplier cancellation to the cancellation rate alone", () => {
    const cancelled = record({ status: "cancelled", cancelledBySupplier: true });
    expect(acceptOutcome(cancelled, after(100))).toBe("pending");
  });

  it("still counts an accept that happened before the parcel was cancelled", () => {
    const cancelled = record({ status: "cancelled", acceptedAt: after(30) });
    expect(acceptOutcome(cancelled, after(100))).toBe("late");
  });

  it("cannot be measured without a forward", () => {
    expect(acceptOutcome(record({ forwardedAt: null }), after(100))).toBe("pending");
  });
});

describe("dispatchOutcome", () => {
  it("uses the supplier's own dispatch hours without a marketplace deadline", () => {
    expect(dispatchOutcome(record({ shippedAt: after(47) }), after(60))).toBe("on_time");
    expect(dispatchOutcome(record({ shippedAt: after(49) }), after(60))).toBe("late");
  });

  it("gives the whole day of a marketplace deadline", () => {
    // 2026-10-12 in Brazil ends at 2026-10-13T03:00Z.
    const deadline = new Date("2026-10-12T03:00:00Z");
    const shippedLate = new Date("2026-10-12T23:00:00Z");
    expect(
      dispatchOutcome(record({ dispatchDeadlineAt: deadline, shippedAt: shippedLate }), after(200)),
    ).toBe("on_time");
    const nextDay = new Date("2026-10-13T04:00:00Z");
    expect(
      dispatchOutcome(record({ dispatchDeadlineAt: deadline, shippedAt: nextDay }), after(200)),
    ).toBe("late");
  });

  it("follows the cancellation rule of the accept", () => {
    expect(dispatchOutcome(record({ status: "not_delivered" }), after(100))).toBe("pending");
    const cancelled = record({ status: "cancelled", cancelledBySupplier: true });
    expect(dispatchOutcome(cancelled, after(100))).toBe("pending");
  });
});

describe("tallies", () => {
  it("counts every forwarded parcel for cancellations", () => {
    expect(
      tallyCancellations([record(), record({ cancelledBySupplier: true, status: "cancelled" })]),
    ).toEqual({ good: 1, counted: 2 });
  });

  it("sums the stars", () => {
    const review = { orderId: "o", externalOrderId: "e", createdAt: FORWARDED_AT };
    expect(
      tallyRatings([
        { ...review, rating: 4 },
        { ...review, rating: 2 },
      ]),
    ).toEqual({
      sum: 6,
      count: 2,
    });
  });
});
