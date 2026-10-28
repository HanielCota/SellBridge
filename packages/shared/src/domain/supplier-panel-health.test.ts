import { describe, expect, it } from "vitest";
import {
  computeSupplierHealth,
  healthDrillDown,
  healthWindows,
  type HealthInput,
  type HealthMetric,
  type ReviewHealthRecord,
  type ShipmentHealthRecord,
} from "./supplier-panel-health.ts";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = new Date("2026-10-16T15:00:00Z");

let sequence = 0;

function shipment(overrides: Partial<ShipmentHealthRecord> = {}): ShipmentHealthRecord {
  sequence += 1;
  const forwardedAt = overrides.forwardedAt ?? new Date(NOW.getTime() - 10 * DAY);
  return {
    shipmentId: `shipment-${sequence}`,
    orderId: `order-${sequence}`,
    externalOrderId: `ML-${sequence}`,
    status: "shipped",
    dispatchDeadlineAt: null,
    estimatedDeliveryAt: null,
    forwardedAt,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    acceptedAt: new Date(forwardedAt.getTime() + HOUR),
    shippedAt: new Date(forwardedAt.getTime() + 10 * HOUR),
    cancelledBySupplier: false,
    ...overrides,
  };
}

/** A parcel still with the supplier, forwarded `hours` ago. */
function openParcel(status: "forwarded" | "accepted", hours: number): ShipmentHealthRecord {
  return shipment({
    forwardedAt: new Date(NOW.getTime() - hours * HOUR),
    status,
    acceptedAt: status === "accepted" ? new Date(NOW.getTime() - (hours - 1) * HOUR) : null,
    shippedAt: null,
  });
}

function lateDispatch(daysAgo = 10): ShipmentHealthRecord {
  const forwardedAt = new Date(NOW.getTime() - daysAgo * DAY);
  return shipment({ forwardedAt, shippedAt: new Date(forwardedAt.getTime() + 60 * HOUR) });
}

function lateAccept(): ShipmentHealthRecord {
  const forwardedAt = new Date(NOW.getTime() - 10 * DAY);
  return shipment({ forwardedAt, acceptedAt: new Date(forwardedAt.getTime() + 30 * HOUR) });
}

function supplierCancelled(): ShipmentHealthRecord {
  return shipment({
    status: "cancelled",
    acceptedAt: null,
    shippedAt: null,
    cancelledBySupplier: true,
  });
}

function review(rating: number, daysAgo = 5): ReviewHealthRecord {
  sequence += 1;
  return {
    orderId: `order-${sequence}`,
    externalOrderId: `ML-${sequence}`,
    rating,
    tags: [],
    createdAt: new Date(NOW.getTime() - daysAgo * DAY),
  };
}

function times<Item>(count: number, make: () => Item): Item[] {
  return Array.from({ length: count }, make);
}

function health(input: Partial<HealthInput>) {
  return computeSupplierHealth({ shipments: [], reviews: [], now: NOW, ...input });
}

function metricOf(result: { metrics: HealthMetric[] }, key: HealthMetric["key"]): HealthMetric {
  const metric = result.metrics.find((candidate) => candidate.key === key);
  if (metric === undefined) {
    throw new Error(`missing ${key}`);
  }
  return metric;
}

describe("computeSupplierHealth", () => {
  it("shows insufficient data instead of red when there are too few orders", () => {
    const result = health({ shipments: times(9, () => lateDispatch()) });
    const dispatch = metricOf(result, "dispatch_on_time");
    expect(dispatch.level).toBe("insufficient");
    expect(dispatch.value).toBe(0);
    expect(dispatch.forecast).toEqual({ kind: "collect", events: 1 });
    expect(result.level).toBe("insufficient");
  });

  it("measures from the tenth order on", () => {
    const result = health({ shipments: times(10, () => shipment()) });
    expect(metricOf(result, "dispatch_on_time").level).toBe("green");
    expect(result.level).toBe("green");
  });

  it("keeps dispatch green at exactly 90% and turns yellow just below", () => {
    const atTarget = health({ shipments: [...times(9, () => shipment()), lateDispatch()] });
    expect(metricOf(atTarget, "dispatch_on_time").value).toBe(0.9);
    expect(metricOf(atTarget, "dispatch_on_time").level).toBe("green");
    const below = health({
      shipments: [...times(17, () => shipment()), lateDispatch(), lateDispatch()],
    });
    expect(metricOf(below, "dispatch_on_time").level).toBe("yellow");
  });

  it("turns dispatch red below 80%", () => {
    const atFloor = health({
      shipments: [...times(8, () => shipment()), ...times(2, lateDispatch)],
    });
    expect(metricOf(atFloor, "dispatch_on_time").level).toBe("yellow");
    const below = health({ shipments: [...times(7, () => shipment()), ...times(3, lateDispatch)] });
    expect(metricOf(below, "dispatch_on_time").level).toBe("red");
    expect(below.level).toBe("red");
  });

  it("holds the cancellation line at 2% green and 2.5% yellow", () => {
    const green = health({ shipments: [...times(49, () => shipment()), supplierCancelled()] });
    expect(metricOf(green, "supplier_cancellations").level).toBe("green");
    const yellow = health({ shipments: [...times(39, () => shipment()), supplierCancelled()] });
    expect(metricOf(yellow, "supplier_cancellations").value).toBe(0.025);
    expect(metricOf(yellow, "supplier_cancellations").level).toBe("yellow");
    const red = health({ shipments: [...times(29, () => shipment()), supplierCancelled()] });
    expect(metricOf(red, "supplier_cancellations").level).toBe("red");
  });

  it("rates the stars with the public score lines", () => {
    const green = health({ reviews: times(10, () => review(4)) });
    expect(metricOf(green, "average_rating").level).toBe("green");
    const yellow = health({
      reviews: [...times(6, () => review(4)), ...times(4, () => review(3))],
    });
    expect(metricOf(yellow, "average_rating").value).toBeCloseTo(3.6);
    expect(metricOf(yellow, "average_rating").level).toBe("yellow");
    const red = health({ reviews: times(10, () => review(3)) });
    expect(metricOf(red, "average_rating").level).toBe("red");
    const few = health({ reviews: times(9, () => review(1)) });
    expect(metricOf(few, "average_rating").level).toBe("insufficient");
    expect(metricOf(few, "average_rating").forecast).toEqual({ kind: "collect", events: 1 });
  });

  it("forecasts how many late dispatches move the level", () => {
    const result = health({ shipments: times(20, () => shipment()) });
    // 20 / 23 = 86.96% is the first value under 90%.
    expect(metricOf(result, "dispatch_on_time").forecast).toEqual({
      kind: "worsen",
      events: 3,
      toLevel: "yellow",
    });
  });

  it("forecasts the way back from red", () => {
    const result = health({
      shipments: [...times(7, () => shipment()), ...times(3, lateDispatch)],
    });
    // (7 + 5) / 15 = 80% reaches yellow again.
    expect(metricOf(result, "dispatch_on_time").forecast).toEqual({
      kind: "recover",
      events: 5,
      toLevel: "yellow",
    });
  });

  it("counts a late accept only against the accept metric", () => {
    const result = health({ shipments: [...times(9, () => shipment()), lateAccept()] });
    expect(metricOf(result, "accept_on_time").value).toBe(0.9);
    expect(metricOf(result, "accept_on_time").level).toBe("yellow");
    expect(metricOf(result, "dispatch_on_time").value).toBe(1);
  });

  it("compares with the previous window", () => {
    const previous = times(10, () => lateDispatch(70));
    const result = health({ shipments: [...previous, ...times(10, () => shipment())] });
    const dispatch = metricOf(result, "dispatch_on_time");
    expect(dispatch.previousValue).toBe(0);
    expect(dispatch.trend).toBe("better");
    expect(dispatch.sample).toBe(10);
  });

  it("reads fewer cancellations as better and a tiny change as flat", () => {
    const previous = [
      ...times(9, () => shipment({ forwardedAt: new Date(NOW.getTime() - 70 * DAY) })),
    ];
    const cancelledBefore = shipment({
      forwardedAt: new Date(NOW.getTime() - 70 * DAY),
      status: "cancelled",
      cancelledBySupplier: true,
    });
    const result = health({
      shipments: [...previous, cancelledBefore, ...times(10, () => shipment())],
      reviews: [...times(10, () => review(5, 70)), ...times(10, () => review(5))],
    });
    expect(metricOf(result, "supplier_cancellations").trend).toBe("better");
    expect(metricOf(result, "average_rating").trend).toBe("flat");
    expect(metricOf(result, "accept_on_time").trend).toBe("flat");
  });

  it("has no trend when the previous window is too small", () => {
    const result = health({ shipments: times(10, () => shipment()) });
    expect(metricOf(result, "dispatch_on_time").trend).toBeNull();
  });

  it("does not count parcels whose deadline is still ahead", () => {
    const fresh = shipment({
      forwardedAt: new Date(NOW.getTime() - 2 * HOUR),
      status: "forwarded",
      acceptedAt: null,
      shippedAt: null,
    });
    const result = health({ shipments: [fresh] });
    expect(metricOf(result, "accept_on_time").sample).toBe(0);
    expect(metricOf(result, "accept_on_time").value).toBeNull();
    expect(metricOf(result, "supplier_cancellations").sample).toBe(0);
  });

  it("keeps cancellations at too little data while the parcels are still open", () => {
    const parcels = [
      ...times(9, () => openParcel("forwarded", 2)),
      ...times(3, () => openParcel("accepted", 5)),
    ];
    const cancellations = metricOf(health({ shipments: parcels }), "supplier_cancellations");
    expect(cancellations.level).toBe("insufficient");
    expect(cancellations.sample).toBe(0);
    expect(cancellations.forecast).toEqual({ kind: "collect", events: 10 });
  });

  it("is steady when no realistic number of orders changes the level", () => {
    const result = health({ reviews: times(1600, () => review(5)) });
    expect(metricOf(result, "average_rating").forecast).toEqual({ kind: "steady" });
  });
});

describe("healthDrillDown", () => {
  it("lists the late dispatches of the current window, newest first", () => {
    const older = lateDispatch(20);
    const newer = lateDispatch(3);
    const outside = lateDispatch(70);
    const rows = healthDrillDown("dispatch_on_time", {
      shipments: [older, shipment(), newer, outside],
      reviews: [],
      now: NOW,
    });
    expect(rows.map((row) => row.orderId)).toEqual([newer.orderId, older.orderId]);
    expect(rows[0]?.rating).toBeNull();
  });

  it("lists late accepts and supplier cancellations", () => {
    const late = lateAccept();
    const cancelled = supplierCancelled();
    const input = { shipments: [late, cancelled, shipment()], reviews: [], now: NOW };
    expect(healthDrillDown("accept_on_time", input).map((row) => row.orderId)).toEqual([
      late.orderId,
    ]);
    expect(healthDrillDown("supplier_cancellations", input).map((row) => row.orderId)).toEqual([
      cancelled.orderId,
    ]);
  });

  it("lists the low reviews behind the rating", () => {
    const low = review(2);
    const rows = healthDrillDown("average_rating", {
      shipments: [],
      reviews: [review(5), low, review(1, 80)],
      now: NOW,
    });
    expect(rows).toEqual([
      {
        orderId: low.orderId,
        externalOrderId: low.externalOrderId,
        shipmentId: null,
        at: low.createdAt,
        rating: 2,
        lateByMilliseconds: null,
        tags: [],
      },
    ]);
  });

  it("says how long after the deadline each late step happened", () => {
    const rows = healthDrillDown("accept_on_time", {
      shipments: [lateAccept()],
      reviews: [],
      now: NOW,
    });
    // Accepted 30 h after the forward against a 24 h accept time.
    expect(rows[0]?.lateByMilliseconds).toBe(6 * HOUR);
  });

  it("counts a step still waiting as late until now", () => {
    const waiting = openParcel("forwarded", 30);
    const rows = healthDrillDown("accept_on_time", { shipments: [waiting], reviews: [], now: NOW });
    expect(rows[0]?.shipmentId).toBe(waiting.shipmentId);
    expect(rows[0]?.lateByMilliseconds).toBe(6 * HOUR);
  });

  it("lists the returned parcels", () => {
    const sentBack = shipment({ status: "returned" });
    const rows = healthDrillDown("supplier_returns", {
      shipments: [shipment({ status: "delivered" }), sentBack],
      reviews: [],
      now: NOW,
    });
    expect(rows.map((row) => row.orderId)).toEqual([sentBack.orderId]);
    expect(rows[0]?.lateByMilliseconds).toBeNull();
  });
});

function delivered(): ShipmentHealthRecord {
  return shipment({ status: "delivered" });
}

function returned(): ShipmentHealthRecord {
  return shipment({ status: "returned" });
}

describe("supplier returns", () => {
  it("holds the return line at 2% green and 3% yellow, like the public score", () => {
    const green = health({ shipments: [...times(49, delivered), returned()] });
    expect(metricOf(green, "supplier_returns").value).toBe(0.02);
    expect(metricOf(green, "supplier_returns").level).toBe("green");
    const yellow = health({ shipments: [...times(97, delivered), ...times(3, returned)] });
    expect(metricOf(yellow, "supplier_returns").level).toBe("yellow");
    const red = health({ shipments: [...times(24, delivered), returned()] });
    expect(metricOf(red, "supplier_returns").level).toBe("red");
    expect(red.level).toBe("red");
  });

  it("counts only parcels the buyer received", () => {
    const result = health({ shipments: [...times(9, delivered), ...times(5, () => shipment())] });
    expect(metricOf(result, "supplier_returns").sample).toBe(9);
    expect(metricOf(result, "supplier_returns").level).toBe("insufficient");
  });

  it("forecasts the returns left before the level drops", () => {
    const result = health({ shipments: times(20, delivered) });
    expect(metricOf(result, "supplier_returns").forecast).toEqual({
      kind: "worsen",
      events: 1,
      toLevel: "red",
    });
  });
});

describe("healthWindows", () => {
  it("counts a review stamped a moment after the app's clock", () => {
    const result = health({ reviews: times(10, () => review(5, -0.0001)) });
    expect(metricOf(result, "average_rating").sample).toBe(10);
  });

  it("places the previous window right before the current one", () => {
    const { current, previous } = healthWindows(NOW);
    expect(current.to).toBeNull();
    expect(previous.to).toEqual(current.from);
    expect(current.from.getTime() - previous.from.getTime()).toBe(60 * DAY);
  });
});
