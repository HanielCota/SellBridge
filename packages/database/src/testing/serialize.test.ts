import { describe, expect, it } from "vitest";
import { collectKeys, serializeWithoutIdsOrTimes } from "./serialize.ts";

const ID_WITH_PRICE_DIGITS = "0f3990aa-1234-4b5c-8d3e-399000000001";

describe("serializeWithoutIdsOrTimes", () => {
  it("hides digit runs that only appear inside a random id", () => {
    const row = { shipmentId: ID_WITH_PRICE_DIGITS, quantity: 2 };

    const text = serializeWithoutIdsOrTimes(row);

    expect(JSON.stringify(row)).toContain("3990");
    expect(text).not.toContain("3990");
  });

  it("still shows a price stored as a number, a string or inside free text", () => {
    const rows = [
      { shipmentId: ID_WITH_PRICE_DIGITS, cost: 3990 },
      { note: "vendido por 3990" },
      { reference: `ORD-${ID_WITH_PRICE_DIGITS}-3990` },
    ];

    const texts = rows.map((row) => serializeWithoutIdsOrTimes(row));

    expect(texts.every((text) => text.includes("3990"))).toBe(true);
  });

  it("hides a time whose seconds and milliseconds read like a price in reais", () => {
    const row = { shippedAt: new Date("2026-11-24T03:21:39.912Z"), quantity: 2 };

    const text = serializeWithoutIdsOrTimes(row);

    expect(JSON.stringify(row)).toMatch(/39[.,]9/);
    expect(text).not.toMatch(/39[.,]9/);
  });

  it("still shows a price in reais written as text", () => {
    const text = serializeWithoutIdsOrTimes({ note: "vendido por R$ 39,90" });

    expect(text).toMatch(/39[.,]9/);
  });
});

describe("collectKeys", () => {
  it("lists keys at every depth, skipping dates and nulls", () => {
    const rows = [
      { shipmentId: "a", at: new Date(), tracking: null, items: [{ unitPriceCents: 1 }] },
    ];

    const keys = collectKeys(rows);

    expect(keys).toEqual(["shipmentId", "at", "tracking", "items", "unitPriceCents"]);
  });
});
