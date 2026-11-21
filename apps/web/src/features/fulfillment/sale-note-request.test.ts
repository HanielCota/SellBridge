import { describe, expect, test } from "vitest";
import { asksForSaleNote } from "./sale-note-request";

describe("asksForSaleNote", () => {
  test("stops asking for the sale note once the parcel is cancelled", () => {
    expect(asksForSaleNote("cancelled", { accessKey: null, erpStarted: false })).toBe(false);
  });

  test("keeps a note already sent visible on a cancelled parcel", () => {
    expect(asksForSaleNote("cancelled", { accessKey: "3".repeat(44), erpStarted: false })).toBe(
      true,
    );
  });

  test("asks for the note while the parcel is on its way", () => {
    expect(asksForSaleNote("forwarded", { accessKey: null, erpStarted: false })).toBe(true);
  });

  test("keeps the card when the Bling already started a note whose key never came back", () => {
    expect(asksForSaleNote("cancelled", { accessKey: null, erpStarted: true })).toBe(true);
  });
});
