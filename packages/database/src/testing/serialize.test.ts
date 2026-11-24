import { describe, expect, it } from "vitest";
import { collectKeys, serializeWithoutIds } from "./serialize.ts";

const ID_WITH_PRICE_DIGITS = "0f3990aa-1234-4b5c-8d3e-399000000001";

describe("serializeWithoutIds", () => {
  it("hides digit runs that only appear inside a random id", () => {
    const row = { shipmentId: ID_WITH_PRICE_DIGITS, quantity: 2 };

    const text = serializeWithoutIds(row);

    expect(JSON.stringify(row)).toContain("3990");
    expect(text).not.toContain("3990");
  });

  it("still shows a price stored as a number, a string or inside free text", () => {
    const rows = [
      { shipmentId: ID_WITH_PRICE_DIGITS, cost: 3990 },
      { note: "vendido por 3990" },
      { reference: `ORD-${ID_WITH_PRICE_DIGITS}-3990` },
    ];

    const texts = rows.map((row) => serializeWithoutIds(row));

    expect(texts.every((text) => text.includes("3990"))).toBe(true);
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
