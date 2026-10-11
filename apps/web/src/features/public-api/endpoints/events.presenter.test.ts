import { describe, expect, it } from "vitest";
import { presentApiEvent } from "./events.presenter";

const orderData = {
  orderId: "00000000-0000-4000-8000-000000000001",
  externalOrderId: "ML-1",
  storeId: "00000000-0000-4000-8000-000000000002",
  status: "paid",
  previousStatus: null,
  totalCents: 1000,
  orderedAt: "2026-01-01T00:00:00.000Z",
};

const record = {
  id: "00000000-0000-4000-8000-000000000003",
  sequence: 42,
  type: "order.created",
  data: orderData,
  createdAt: new Date("2026-01-01T00:00:01Z"),
};

describe("presentApiEvent", () => {
  it("returns the public event with an ISO date", () => {
    expect(presentApiEvent(record)).toEqual({
      id: record.id,
      sequence: 42,
      type: "order.created",
      createdAt: "2026-01-01T00:00:01.000Z",
      data: orderData,
    });
  });

  it("skips unknown types and data that no longer matches the contract", () => {
    expect(presentApiEvent({ ...record, type: "order.deleted" })).toBeNull();
    expect(presentApiEvent({ ...record, data: { orderId: "x" } })).toBeNull();
  });
});
