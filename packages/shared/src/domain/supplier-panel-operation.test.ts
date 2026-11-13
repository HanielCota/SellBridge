import { describe, expect, it } from "vitest";
import type { ShipmentHealthRecord } from "./supplier-panel-health-outcomes.ts";
import { computeOperationRates, operationShare } from "./supplier-panel-operation.ts";

const HOUR = 3_600_000;
const FORWARDED_AT = new Date("2026-10-10T12:00:00Z");

function after(hours: number): Date {
  return new Date(FORWARDED_AT.getTime() + hours * HOUR);
}

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

function shipped(hours: number): ShipmentHealthRecord {
  return record({ status: "shipped", acceptedAt: after(1), shippedAt: after(hours) });
}

describe("operationShare", () => {
  it("divides the part by the total", () => {
    const share = operationShare(3, 40);

    expect(share).toEqual({ part: 3, total: 40, rate: 0.075 });
  });

  it("has no rate when there is nothing to count", () => {
    const share = operationShare(0, 0);

    expect(share).toEqual({ part: 0, total: 0, rate: null });
  });

  it("has no rate for a negative total", () => {
    const share = operationShare(2, -1);

    expect(share.rate).toBeNull();
  });
});

describe("computeOperationRates", () => {
  it("reads nothing from a period without parcels", () => {
    const rates = computeOperationRates([], after(100));

    expect(rates).toEqual({
      lateDispatches: { part: 0, total: 0, rate: null },
      supplierCancellations: { part: 0, total: 0, rate: null },
      averageDispatchMilliseconds: null,
      dispatchedParcels: 0,
    });
  });

  it("counts a parcel shipped after its dispatch time as late", () => {
    const records = [shipped(10), shipped(20), shipped(60), shipped(30)];

    const rates = computeOperationRates(records, after(100));

    expect(rates.lateDispatches).toEqual({ part: 1, total: 4, rate: 0.25 });
  });

  it("counts a parcel still waiting past its dispatch time as late", () => {
    const rates = computeOperationRates([record({ acceptedAt: after(1) })], after(49));

    expect(rates.lateDispatches).toEqual({ part: 1, total: 1, rate: 1 });
  });

  it("leaves out a parcel whose dispatch time is still ahead", () => {
    const rates = computeOperationRates([record({ acceptedAt: after(1) })], after(10));

    expect(rates.lateDispatches.rate).toBeNull();
  });

  it("counts the supplier's own cancellations among the settled parcels", () => {
    const records = [
      shipped(10),
      shipped(10),
      shipped(10),
      record({ status: "cancelled", cancelledBySupplier: true }),
      record({ status: "cancelled" }),
      record(),
    ];

    const rates = computeOperationRates(records, after(10));

    expect(rates.supplierCancellations).toEqual({ part: 1, total: 4, rate: 0.25 });
  });

  it("averages the time from the forward to the dispatch", () => {
    const rates = computeOperationRates([shipped(10), shipped(20)], after(100));

    expect(rates.averageDispatchMilliseconds).toBe(15 * HOUR);
    expect(rates.dispatchedParcels).toBe(2);
  });

  it("skips a parcel without a forward or shipped before its latest forward", () => {
    const records = [
      shipped(6),
      record({ status: "shipped", forwardedAt: null, shippedAt: after(5) }),
      record({ status: "shipped", shippedAt: after(-5) }),
    ];

    const rates = computeOperationRates(records, after(100));

    expect(rates.averageDispatchMilliseconds).toBe(6 * HOUR);
    expect(rates.dispatchedParcels).toBe(1);
  });
});
