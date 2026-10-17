import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  batchAcceptSchema,
  MAX_BATCH_SHIPMENTS,
  supplierOrdersUrlSearchSchema,
  supplierShipmentsSearchSchema,
} from "./supplier-panel-orders-schema.ts";
import {
  isQueueTab,
  SUPPLIER_TAB_STATUSES,
  supplierOrderProblems,
} from "./supplier-panel-orders-tabs.ts";

describe("supplierOrderProblems", () => {
  it("lists every problem, the blocked sale first", () => {
    expect(
      supplierOrderProblems({ overdue: true, emailFailed: true, orderStatus: "cancelled" }),
    ).toEqual(["order_blocked", "overdue", "email_failed"]);
  });

  it("finds nothing on a paid order on time", () => {
    expect(
      supplierOrderProblems({ overdue: false, emailFailed: false, orderStatus: "paid" }),
    ).toEqual([]);
  });
});

describe("tabs", () => {
  it("sorts the queue tabs by deadline and the history tabs by change", () => {
    expect(isQueueTab("todo")).toBe(true);
    expect(isQueueTab("problem")).toBe(true);
    expect(isQueueTab("shipped")).toBe(false);
    expect(isQueueTab("closed")).toBe(false);
  });

  it("keeps shipped parcels out of the supplier's to-do list", () => {
    expect(SUPPLIER_TAB_STATUSES.todo).not.toContain("shipped");
    expect(SUPPLIER_TAB_STATUSES.closed).toContain("delivered");
  });
});

describe("supplierShipmentsSearchSchema", () => {
  it("defaults to the to-do tab, first page, no search", () => {
    const supplierId = randomUUID();
    expect(supplierShipmentsSearchSchema.parse({ supplierId })).toEqual({
      supplierId,
      tab: "todo",
      query: "",
      page: 1,
    });
  });

  it("refuses a supplier id that is not a uuid", () => {
    expect(supplierShipmentsSearchSchema.safeParse({ supplierId: "1 or 1=1" }).success).toBe(false);
  });
});

describe("batchAcceptSchema", () => {
  const supplierId = randomUUID();

  it("refuses an empty, repeated or oversized selection", () => {
    const id = randomUUID();
    expect(batchAcceptSchema.safeParse({ supplierId, shipmentIds: [] }).success).toBe(false);
    expect(batchAcceptSchema.safeParse({ supplierId, shipmentIds: [id, id] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_BATCH_SHIPMENTS + 1 }, () => randomUUID());
    expect(batchAcceptSchema.safeParse({ supplierId, shipmentIds: tooMany }).success).toBe(false);
  });

  it("accepts distinct shipment ids", () => {
    const shipmentIds = [randomUUID(), randomUUID()];
    expect(batchAcceptSchema.parse({ supplierId, shipmentIds }).shipmentIds).toEqual(shipmentIds);
  });
});

describe("supplierOrdersUrlSearchSchema", () => {
  it("falls back on a tampered address instead of failing the page", () => {
    expect(supplierOrdersUrlSearchSchema.parse({ tab: "nope", page: "-3" })).toEqual({
      tab: "todo",
      query: undefined,
      page: 1,
    });
  });
});
