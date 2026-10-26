import { describe, expect, it } from "vitest";
import {
  carrierEventsOf,
  isCorreiosCode,
  normalizeTrackingInput,
  trackingQuerySchema,
} from "./carrier-tracking";
import { createCarrierTrackingProvider } from "./carrier-tracking-provider";
import { explainTracking } from "./tracking-explanation";

const now = new Date("2026-10-22T15:00:00Z");

describe("tracking code format", () => {
  it("accepts a Correios code typed with spaces, dots and lowercase letters", () => {
    const code = normalizeTrackingInput(" aa 123.456-789 br ");
    expect(code).toBe("AA123456789BR");
    expect(isCorreiosCode(code)).toBe(true);
  });

  it.each(["AA12345678BR", "A1123456789BR", "123456789", "AA123456789B"])(
    "refuses %s as a Correios code",
    (code) => {
      expect(isCorreiosCode(normalizeTrackingInput(code))).toBe(false);
    },
  );

  it("refuses an empty search with a message in Portuguese", () => {
    const parsed = trackingQuerySchema.safeParse({ query: "   " });
    expect(parsed.error?.issues[0]?.message).toBe(
      "Digite o código de rastreio ou o número do pedido",
    );
  });
});

describe("createCarrierTrackingProvider", () => {
  it("answers 'not connected' when no carrier is configured", async () => {
    const provider = createCarrierTrackingProvider("off");
    await expect(
      provider.trackParcel({ code: "AA123456789BR", handedOverAt: null }),
    ).resolves.toEqual({ state: "not_connected" });
  });
});

describe("carrierEventsOf", () => {
  it("reads a code the carrier does not know yet as a parcel still waiting for its first scan", () => {
    const events = carrierEventsOf({ state: "not_found" });
    expect(events).toEqual([]);
    const explanation = explainTracking({
      parcel: {
        status: "shipped",
        catalogKind: "supplier",
        supplierName: "Casa Aurora",
        delay: null,
        acceptBy: null,
        dispatchBy: null,
        dispatchDeadlineAt: null,
        estimatedDeliveryAt: null,
        shippedAt: new Date(now.getTime() - 72 * 3_600_000),
      },
      carrierEvents: events,
      now,
    });
    expect(explanation).toMatchObject({ holder: "collection", tone: "warning" });
  });

  it("has no events to read when the carrier could not be asked", () => {
    expect(carrierEventsOf(null)).toBeNull();
    expect(carrierEventsOf({ state: "not_connected" })).toBeNull();
    expect(carrierEventsOf({ state: "unavailable" })).toBeNull();
  });

  it("returns the carrier's events when it found the code", () => {
    const events = [
      { at: now, place: null, kind: "posted" as const, description: "Objeto postado" },
    ];
    expect(carrierEventsOf({ state: "found", carrier: "Correios", events })).toEqual(events);
  });
});
