import { describe, expect, it } from "vitest";
import { CONFIRMATION_REMINDER_DAYS, shipmentDelay } from "./shipment-delay.ts";

const now = new Date("2026-10-15T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const hoursAhead = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
const base = {
  dispatchDeadlineAt: null,
  estimatedDeliveryAt: null,
  shippedAt: null,
};

describe("shipmentDelay", () => {
  it("flags a parcel still with the supplier after the dispatch deadline", () => {
    for (const status of ["forwarded", "accepted", "picking", "ready"] as const) {
      expect(shipmentDelay({ ...base, status, dispatchDeadlineAt: hoursAgo(48) }, now)).toBe(
        "dispatch_overdue",
      );
    }
    expect(
      shipmentDelay({ ...base, status: "picking", dispatchDeadlineAt: hoursAhead(1) }, now),
    ).toBeNull();
  });

  it("flags a shipped parcel past its delivery estimate", () => {
    expect(
      shipmentDelay({ ...base, status: "shipped", estimatedDeliveryAt: hoursAgo(48) }, now),
    ).toBe("delivery_overdue");
    expect(
      shipmentDelay({ ...base, status: "shipped", estimatedDeliveryAt: hoursAhead(1) }, now),
    ).toBeNull();
  });

  it("keeps the whole day of a deadline on time, in Brazil time", () => {
    // Mercado Livre dates the deadline at midnight -03:00; at 09:00 that same day it is not late.
    const today = new Date("2026-10-15T00:00:00.000-03:00");
    const timing = { ...base, status: "shipped" as const, estimatedDeliveryAt: today };
    expect(shipmentDelay(timing, now)).toBeNull();
    expect(shipmentDelay(timing, new Date("2026-10-15T23:59:00.000-03:00"))).toBeNull();
    expect(shipmentDelay(timing, new Date("2026-10-16T00:00:00.000-03:00"))).toBe(
      "delivery_overdue",
    );
  });

  it("reminds the reseller to confirm a parcel shipped long ago with no estimate", () => {
    const longAgo = hoursAgo(CONFIRMATION_REMINDER_DAYS * 24 + 1);
    expect(shipmentDelay({ ...base, status: "shipped", shippedAt: longAgo }, now)).toBe(
      "awaiting_confirmation",
    );
    expect(shipmentDelay({ ...base, status: "shipped", shippedAt: hoursAgo(24) }, now)).toBeNull();
  });

  it("says nothing once the parcel is over", () => {
    for (const status of ["delivered", "cancelled", "returned", "not_delivered"] as const) {
      expect(
        shipmentDelay(
          {
            status,
            dispatchDeadlineAt: hoursAgo(99),
            estimatedDeliveryAt: hoursAgo(99),
            shippedAt: hoursAgo(999),
          },
          now,
        ),
      ).toBeNull();
    }
  });
});
