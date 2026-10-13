import { logger } from "@sellbridge/shared/logger";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ORDER_FIXTURES } from "./fixtures/orders.ts";
import { SHIPMENT_FIXTURES } from "./fixtures/shipments.ts";
import { mapMercadoLivreOrder } from "./orders.ts";
import { orderSchema } from "./schemas.ts";
import { shipmentTrackingStatus } from "./shipping.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Mercado Livre order status", () => {
  it.each([
    ["confirmed", "pending"],
    ["payment_required", "pending"],
    ["payment_in_process", "pending"],
    ["partially_paid", "pending"],
    ["paid", "paid"],
    ["paid_and_delivered", "paid"],
    // The refunded money is an adjustment (item 04.b); the order itself stays sold.
    ["partially_refunded", "paid"],
    // Mercado Livre says not to ship: held like an unpaid order, never released to the supplier.
    ["fraud_risk_detected", "pending"],
    ["pending_cancel", "cancelled"],
    ["cancelled", "cancelled"],
    ["invalid", "cancelled"],
  ] as const)("%s → %s", (fixture, expected) => {
    const raw = orderSchema.parse(ORDER_FIXTURES[fixture]);
    expect(mapMercadoLivreOrder(raw).status).toBe(expected);
  });

  it("holds an unknown status as pending and logs it", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const raw = orderSchema.parse(ORDER_FIXTURES.unknown);
    expect(mapMercadoLivreOrder(raw).status).toBe("pending");
    expect(warn).toHaveBeenCalledWith("mercado_livre.unknown_order_status", {
      externalOrderId: "2000003508897196",
      status: "something_new",
    });
  });
});

describe("Mercado Livre shipment status", () => {
  it.each([
    // Before the parcel leaves, the supplier's own steps (accepted, picking, ready) rule.
    ["pending", null],
    ["handling", null],
    ["ready_to_print", null],
    ["dropped_off", null],
    ["shipped", "shipped"],
    ["out_for_delivery", "shipped"],
    ["receiver_absent_in_route", "shipped"],
    ["stale_shipped", "shipped"],
    ["delivered", "delivered"],
    ["delivered_inferred", "delivered"],
    ["not_delivered_receiver_absent", "not_delivered"],
    // On its way back: not delivered yet, and not back with the seller either.
    ["not_delivered_returning", "not_delivered"],
    ["not_delivered_lost", "not_delivered"],
    ["returned", "returned"],
    ["returned_to_warehouse", "returned"],
    ["cancelled", "cancelled"],
    ["unknown", null],
  ] as const)("%s → %s", (fixture, expected) => {
    const { status, substatus } = SHIPMENT_FIXTURES[fixture];
    expect(shipmentTrackingStatus(status, substatus)).toBe(expected);
  });
});
