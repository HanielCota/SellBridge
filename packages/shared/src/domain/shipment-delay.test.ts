import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_REMINDER_DAYS,
  overdueSince,
  shipmentDeadlines,
  shipmentDelay,
} from "./shipment-delay.ts";

const now = new Date("2026-10-15T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const hoursAhead = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
const base = {
  dispatchDeadlineAt: null,
  estimatedDeliveryAt: null,
  shippedAt: null,
  forwardedAt: null,
  acceptWithinHours: null,
  dispatchWithinHours: null,
};
/** Forwarded `hours` ago to a supplier with one day to accept and two to dispatch. */
const forwarded = (hours: number) => ({
  ...base,
  forwardedAt: hoursAgo(hours),
  acceptWithinHours: 24,
  dispatchWithinHours: 48,
});

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
            ...forwarded(999),
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

describe("overdueSince", () => {
  // Regression: the late alert was dated at the deadline (00:00 of the day), before a bell
  // opened during that day, so it never counted as new once the day was over.
  it("is the end of the missed day in Brazil, the instant the parcel turns late", () => {
    const deadline = new Date("2026-10-15T00:00:00-03:00");
    const since = overdueSince(deadline);
    expect(since.toISOString()).toBe("2026-10-16T03:00:00.000Z");
    const timing = {
      status: "accepted" as const,
      ...base,
      dispatchDeadlineAt: deadline,
    };
    expect(shipmentDelay(timing, new Date(since.getTime() - 1))).toBeNull();
    expect(shipmentDelay(timing, since)).toBe("dispatch_overdue");
  });
});

describe("the supplier's own deadlines", () => {
  it("flags a parcel the supplier has not accepted within its accept time", () => {
    expect(shipmentDelay({ ...forwarded(25), status: "forwarded" }, now)).toBe("accept_overdue");
    expect(shipmentDelay({ ...forwarded(23), status: "forwarded" }, now)).toBeNull();
  });

  it("stops counting the accept time once the supplier accepted", () => {
    for (const status of ["accepted", "picking", "ready"] as const) {
      expect(shipmentDelay({ ...forwarded(30), status }, now)).toBeNull();
    }
  });

  it("uses the supplier's dispatch time when the marketplace gave no deadline", () => {
    expect(shipmentDelay({ ...forwarded(49), status: "picking" }, now)).toBe("dispatch_overdue");
    expect(shipmentDelay({ ...forwarded(47), status: "picking" }, now)).toBeNull();
    // Not accepted and past the dispatch time too: the later, worse step is what is late.
    expect(shipmentDelay({ ...forwarded(49), status: "forwarded" }, now)).toBe("dispatch_overdue");
  });

  it("keeps the marketplace's dispatch deadline when there is one", () => {
    const timing = { ...forwarded(100), status: "picking" as const, dispatchDeadlineAt: now };
    expect(shipmentDelay(timing, now)).toBeNull();
  });

  it("counts the supplier's times to the hour, not to the end of the day", () => {
    const justPast = {
      ...forwarded(24),
      forwardedAt: hoursAgo(24.02),
      status: "forwarded" as const,
    };
    expect(shipmentDelay(justPast, now)).toBe("accept_overdue");
  });

  it("says by when the supplier must accept and dispatch", () => {
    expect(shipmentDeadlines({ ...forwarded(10), status: "forwarded" })).toEqual({
      acceptBy: hoursAhead(14),
      dispatchBy: hoursAhead(38),
    });
    // Accepted: only the dispatch is still ahead; the marketplace's date wins when it exists.
    expect(
      shipmentDeadlines({
        ...forwarded(10),
        status: "accepted",
        dispatchDeadlineAt: hoursAhead(5),
      }),
    ).toEqual({ acceptBy: null, dispatchBy: hoursAhead(5) });
    // Shipped or never forwarded: nothing left for the supplier.
    expect(shipmentDeadlines({ ...forwarded(10), status: "shipped" })).toEqual({
      acceptBy: null,
      dispatchBy: null,
    });
    expect(shipmentDeadlines({ ...base, status: "forwarded" })).toEqual({
      acceptBy: null,
      dispatchBy: null,
    });
  });
});
