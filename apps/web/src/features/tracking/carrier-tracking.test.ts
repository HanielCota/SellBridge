import { describe, expect, it } from "vitest";
import {
  carrierTrackingResultSchema,
  isCorreiosCode,
  normalizeTrackingInput,
  trackingQuerySchema,
} from "./carrier-tracking";
import { createCarrierTrackingProvider } from "./carrier-tracking-provider";
import { simulatedCarrierTracking, simulatedScenarioIndex } from "./simulated-carrier-tracking";

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

describe("simulated carrier tracking", () => {
  it("tells the same story for the same code and dispatch date", () => {
    const request = { code: "AA123456789BR", handedOverAt: new Date("2026-10-15T12:00:00Z"), now };
    expect(simulatedCarrierTracking(request)).toEqual(simulatedCarrierTracking(request));
  });

  it("marks its events as a demonstration and never dates one in the future", () => {
    const result = simulatedCarrierTracking({ code: "QB987654321BR", handedOverAt: null, now });
    expect(carrierTrackingResultSchema.parse(result)).toMatchObject({ simulated: true });
    const events = result.state === "found" ? result.events : [];
    expect(events.every((event) => event.at.getTime() <= now.getTime())).toBe(true);
  });

  it("starts every scenario with the posting, after the dispatch", () => {
    const handedOverAt = new Date("2026-10-10T12:00:00Z");
    const codes = Array.from({ length: 24 }, (_, index) => `AB${String(index).padStart(9, "0")}BR`);
    for (const code of codes) {
      const result = simulatedCarrierTracking({ code, handedOverAt, now });
      const first = result.state === "found" ? result.events[0] : undefined;
      expect(first?.kind).toBe("posted");
      expect(first?.at.getTime()).toBeGreaterThan(handedOverAt.getTime());
    }
    expect(new Set(codes.map(simulatedScenarioIndex)).size).toBeGreaterThan(1);
  });
});

describe("createCarrierTrackingProvider", () => {
  it("answers 'not connected' when no carrier is configured", async () => {
    const provider = createCarrierTrackingProvider("off");
    await expect(
      provider.trackParcel({ code: "AA123456789BR", handedOverAt: null }),
    ).resolves.toEqual({ state: "not_connected" });
  });

  it("answers simulated events when asked for the demonstration", async () => {
    const provider = createCarrierTrackingProvider("simulated", () => now);
    const result = await provider.trackParcel({ code: "AA123456789BR", handedOverAt: null });
    expect(result).toMatchObject({ state: "found", carrier: "Correios", simulated: true });
  });
});
