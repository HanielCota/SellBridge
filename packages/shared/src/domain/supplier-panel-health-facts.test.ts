import { describe, expect, it } from "vitest";
import { supplierHealthFacts } from "./supplier-panel-health-facts.ts";
import type { ReviewHealthRecord, ShipmentHealthRecord } from "./supplier-panel-health.ts";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = new Date("2026-10-27T15:00:00Z");
const FORWARDED_AT = new Date(NOW.getTime() - 10 * DAY);

function shipment(overrides: Partial<ShipmentHealthRecord> = {}): ShipmentHealthRecord {
  return {
    shipmentId: "shipment",
    orderId: "order",
    externalOrderId: "ML-1",
    status: "delivered",
    dispatchDeadlineAt: null,
    estimatedDeliveryAt: null,
    forwardedAt: FORWARDED_AT,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    acceptedAt: new Date(FORWARDED_AT.getTime() + 2 * HOUR),
    shippedAt: new Date(FORWARDED_AT.getTime() + 20 * HOUR),
    cancelledBySupplier: false,
    ...overrides,
  };
}

function review(rating: number, daysAgo = 5): ReviewHealthRecord {
  return {
    orderId: "order",
    externalOrderId: "ML-1",
    rating,
    tags: [],
    createdAt: new Date(NOW.getTime() - daysAgo * DAY),
  };
}

describe("supplierHealthFacts", () => {
  it("averages the time from the forward to the accept and to the dispatch", () => {
    const facts = supplierHealthFacts({
      shipments: [
        shipment(),
        shipment({
          acceptedAt: new Date(FORWARDED_AT.getTime() + 4 * HOUR),
          shippedAt: new Date(FORWARDED_AT.getTime() + 60 * HOUR),
        }),
      ],
      reviews: [],
      now: NOW,
    });
    expect(facts.accept_on_time).toEqual({ counted: 2, against: 0, averageMilliseconds: 3 * HOUR });
    expect(facts.dispatch_on_time).toEqual({
      counted: 2,
      against: 1,
      averageMilliseconds: 40 * HOUR,
    });
  });

  it("has no average before any parcel reaches the step", () => {
    const facts = supplierHealthFacts({
      shipments: [shipment({ status: "forwarded", acceptedAt: null, shippedAt: null })],
      reviews: [],
      now: NOW,
    });
    expect(facts.dispatch_on_time.averageMilliseconds).toBeNull();
  });

  it("counts cancellations and returns among the settled parcels", () => {
    const facts = supplierHealthFacts({
      shipments: [
        shipment(),
        shipment({ status: "returned" }),
        shipment({ status: "cancelled", cancelledBySupplier: true, shippedAt: null }),
        shipment({ status: "shipped" }),
      ],
      reviews: [],
      now: NOW,
    });
    expect(facts.supplier_cancellations).toMatchObject({ counted: 4, against: 1 });
    expect(facts.supplier_returns).toMatchObject({ counted: 2, against: 1 });
  });

  it("counts the reviews of the window and the ones at 3 stars or less", () => {
    const facts = supplierHealthFacts({
      shipments: [],
      reviews: [review(5), review(3), review(1), review(2, 90)],
      now: NOW,
    });
    expect(facts.average_rating).toEqual({ counted: 3, against: 2, averageMilliseconds: null });
  });
});
