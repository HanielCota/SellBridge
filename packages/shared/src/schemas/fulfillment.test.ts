import { describe, expect, it } from "vitest";
import { operationsUrlSearchSchema, shipmentUpdateSchema } from "./fulfillment.ts";
const input = {
  shipmentId: "36e45c9e-8db0-4c67-b889-6c2fc1c19087",
  status: "shipped",
  carrier: "Correios",
  trackingCode: "AB123BR",
  trackingUrl: "https://rastreamento.correios.com.br",
  note: "",
};
describe("fulfillment input", () => {
  it("requires tracking on dispatch", () => {
    expect(shipmentUpdateSchema.safeParse({ ...input, trackingCode: "" }).success).toBe(false);
  });
  it("requires a reason to cancel", () => {
    expect(shipmentUpdateSchema.safeParse({ ...input, status: "cancelled" }).success).toBe(false);
  });
  it.each(["javascript:alert(1)", "http://example.com", "data:text/html,test"])(
    "rejects unsafe tracking links %s",
    (trackingUrl) => {
      expect(shipmentUpdateSchema.safeParse({ ...input, trackingUrl }).success).toBe(false);
    },
  );
  it("allows an HTTPS tracking URL", () => {
    expect(shipmentUpdateSchema.safeParse(input).success).toBe(true);
  });
});

describe("operations address bounds", () => {
  it("keeps the deepest page the server serves", () => {
    expect(operationsUrlSearchSchema.parse({ opPage: "10000" }).opPage).toBe(10_000);
  });

  // Regression: page 10001 passed the address and the server refused it, so the tab showed an
  // error instead of a list.
  it.each(["10001", "0", "-1", "1.5", "abc"])("falls back to page 1 for %s", (opPage) => {
    expect(operationsUrlSearchSchema.parse({ opPage }).opPage).toBe(1);
  });

  it("keeps the first 100 characters of a longer search", () => {
    expect(operationsUrlSearchSchema.parse({ opQuery: "x".repeat(120) }).opQuery).toBe(
      "x".repeat(100),
    );
  });
});
