import { describe, expect, it } from "vitest";
import { hasComment, hasNoReviews, reasonLabels } from "./moderated-reviews";

describe("reasonLabels", () => {
  it("names each known reason and skips tags the app no longer knows", () => {
    expect(reasonLabels(["dispatch:bad", "old:tag", "packaging:good"])).toEqual([
      "Atrasou o despacho",
      "Boa embalagem",
    ]);
    expect(reasonLabels([])).toEqual([]);
  });
});

describe("hasComment", () => {
  it("treats a blank or spaces-only comment as no comment", () => {
    expect(hasComment("")).toBe(false);
    expect(hasComment("   \n ")).toBe(false);
    expect(hasComment("Chegou amassado")).toBe(true);
  });
});

describe("hasNoReviews", () => {
  it("keeps the list (and its pager) on a page past the end", () => {
    const emptyPage = { items: [], total: 0 };
    // Page 3 of a supplier left with 12 reviews: no items here, but reviews exist.
    const pagePastTheEnd = { items: [], total: 12 };
    expect(hasNoReviews(emptyPage)).toBe(true);
    expect(hasNoReviews(pagePastTheEnd)).toBe(false);
  });
});
