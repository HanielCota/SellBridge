import { describe, expect, it } from "vitest";
import { shipmentUpdateSchema } from "./fulfillment.ts";
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
