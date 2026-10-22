import { describe, expect, it } from "vitest";
import { moderatedReviewsInputSchema, moderationSearchSchema } from "./moderation-search";

describe("moderationSearchSchema", () => {
  it("opens on page 1 with only commented reviews", () => {
    expect(moderationSearchSchema.parse({})).toEqual({ page: 1, withComment: true });
  });

  it("keeps the filter off when the reader turned it off", () => {
    expect(moderationSearchSchema.parse({ page: 3, withComment: false })).toEqual({
      page: 3,
      withComment: false,
    });
  });

  it("falls back to the defaults for a hand-edited address", () => {
    expect(moderationSearchSchema.parse({ page: -2, withComment: "talvez" })).toEqual({
      page: 1,
      withComment: true,
    });
    expect(moderationSearchSchema.parse({ page: 10_001 })).toEqual({
      page: 1,
      withComment: true,
    });
  });
});

describe("moderatedReviewsInputSchema", () => {
  it("accepts every supplier, or one supplier by id", () => {
    expect(moderatedReviewsInputSchema.parse({ withCommentOnly: true })).toEqual({
      withCommentOnly: true,
      page: 1,
    });
    const supplierId = "0f6a8f4e-5d0b-4c47-9e57-3f0c3b2a1d10";
    expect(
      moderatedReviewsInputSchema.parse({ supplierId, withCommentOnly: false, page: 2 }),
    ).toEqual({ supplierId, withCommentOnly: false, page: 2 });
  });

  it("refuses a supplier id that is not a uuid and a page out of range", () => {
    expect(moderatedReviewsInputSchema.safeParse({ supplierId: "1 or 1=1" }).success).toBe(false);
    expect(moderatedReviewsInputSchema.safeParse({ withCommentOnly: true, page: 0 }).success).toBe(
      false,
    );
    expect(moderatedReviewsInputSchema.safeParse({ page: 1 }).success).toBe(false);
  });
});
