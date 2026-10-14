import { describe, expect, it } from "vitest";
import { catalogSearchSchema } from "./catalog.ts";
import { LISTING_MAX_PRICE_CENTS } from "./stores.ts";
import { REVIEW_COMMENT_MAX_LENGTH, supplierReviewInputSchema } from "./reviews.ts";

const parse = (minCost: unknown) => catalogSearchSchema.parse({ minCost }).minCost;

describe("catalog cost filters", () => {
  it("keeps costs up to the listing ceiling and drops the rest", () => {
    expect(parse("0")).toBe(0);
    expect(parse(String(LISTING_MAX_PRICE_CENTS))).toBe(LISTING_MAX_PRICE_CENTS);
    expect(parse(String(LISTING_MAX_PRICE_CENTS + 1))).toBeUndefined();
    expect(parse("3000000000")).toBeUndefined();
    expect(parse("-1")).toBeUndefined();
    expect(parse("10.5")).toBeUndefined();
    expect(parse("1e400")).toBeUndefined();
  });
});

describe("supplier review comment", () => {
  const review = {
    orderId: "00000000-0000-4000-8000-000000000001",
    supplierId: "00000000-0000-4000-8000-000000000002",
    rating: 5,
    tags: [],
  };

  it("never stores more than the limit after contact details are removed", () => {
    const handles = "@ab ".repeat(REVIEW_COMMENT_MAX_LENGTH / 4);
    expect(handles.trim().length).toBeLessThanOrEqual(REVIEW_COMMENT_MAX_LENGTH);
    const { comment } = supplierReviewInputSchema.parse({ ...review, comment: handles });
    expect(comment.length).toBeLessThanOrEqual(REVIEW_COMMENT_MAX_LENGTH);
  });

  it("never ends the stored comment with half a removal marker", () => {
    // 495 letters and "@ab": the marker would be cut at "[remo".
    const comment = `${"a".repeat(REVIEW_COMMENT_MAX_LENGTH - 5)} @ab`;
    const stored = supplierReviewInputSchema.parse({ ...review, comment }).comment;
    expect(stored).toBe("a".repeat(REVIEW_COMMENT_MAX_LENGTH - 5));
  });

  it("refuses a comment one character over the limit", () => {
    const comment = "a".repeat(REVIEW_COMMENT_MAX_LENGTH + 1);
    expect(supplierReviewInputSchema.safeParse({ ...review, comment }).success).toBe(false);
  });
});
