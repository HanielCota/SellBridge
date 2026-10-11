import { describe, expect, it } from "vitest";
import { fitListingTitle, LISTING_TITLE_MAX_LENGTH, listingsSearchSchema } from "./stores.ts";

describe("fitListingTitle", () => {
  it("keeps a title that already fits, trimmed", () => {
    expect(fitListingTitle("  Fone de ouvido Bluetooth  ")).toBe("Fone de ouvido Bluetooth");
  });

  it("keeps a title of exactly the limit", () => {
    const title = "a".repeat(LISTING_TITLE_MAX_LENGTH);
    expect(fitListingTitle(title)).toBe(title);
  });

  it("cuts a long title at the last word that fits", () => {
    const title =
      "Kit 3 Panelas Antiaderentes Com Tampa De Vidro Cabo Baquelite Indução Cooktop Gás";
    const fitted = fitListingTitle(title);
    expect(fitted).toBe("Kit 3 Panelas Antiaderentes Com Tampa De Vidro Cabo");
    expect(fitted.length).toBeLessThanOrEqual(LISTING_TITLE_MAX_LENGTH);
    expect(title.startsWith(fitted)).toBe(true);
  });

  it("keeps a word that ends exactly at the limit", () => {
    const title = `${"a".repeat(LISTING_TITLE_MAX_LENGTH - 5)} bbbb ccc`;
    expect(fitListingTitle(title)).toBe(`${"a".repeat(LISTING_TITLE_MAX_LENGTH - 5)} bbbb`);
  });

  it("collapses whitespace before measuring", () => {
    const title = `Camiseta   ${"x".repeat(40)}\n\tAlgodão Premium`;
    expect(fitListingTitle(title)).toBe(`Camiseta ${"x".repeat(40)} Algodão`);
  });

  it("cuts mid-word when a single word is longer than the limit", () => {
    const title = `${"y".repeat(LISTING_TITLE_MAX_LENGTH + 15)} final`;
    expect(fitListingTitle(title)).toBe("y".repeat(LISTING_TITLE_MAX_LENGTH));
  });
});

describe("listingsSearchSchema", () => {
  it("keeps a status that has a tab", () => {
    expect(listingsSearchSchema.parse({ status: "error" }).status).toBe("error");
  });

  it("falls back to every status when the URL asks for one without a tab", () => {
    expect(listingsSearchSchema.parse({ status: "pending" }).status).toBeUndefined();
    expect(listingsSearchSchema.parse({ status: "nope" }).status).toBeUndefined();
  });
});
