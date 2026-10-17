import { describe, expect, it } from "vitest";
import { rejectionReasonSchema } from "./supplier-panel-catalog-status.ts";
import {
  REVIEW_FIELDS,
  REVIEW_REASON_PRESETS,
  reasonFromPreset,
  reviewFieldLabel,
  reviewKindOf,
  reviewQueueSearchSchema,
} from "./supplier-product-review.ts";

describe("reviewKindOf", () => {
  it("reads a never-reviewed product as new and a reviewed one as a change", () => {
    expect(reviewKindOf({ reviewedAt: null })).toBe("new");
    expect(reviewKindOf({ reviewedAt: new Date("2026-10-01T00:00:00Z") })).toBe("change");
  });
});

describe("reasonFromPreset", () => {
  it("starts every preset with a message valid as a rejection reason, except the free one", () => {
    for (const preset of REVIEW_REASON_PRESETS) {
      const reason = reasonFromPreset(preset.rule);
      expect(reason.field).toBe(preset.field);
      expect(rejectionReasonSchema.safeParse(reason).success).toBe(preset.rule !== "other");
    }
  });
});

describe("reviewFieldLabel", () => {
  it("names product fields and Mercado Livre attributes in plain words", () => {
    expect(reviewFieldLabel("imageUrls")).toBe("Imagens");
    expect(reviewFieldLabel("attributes.BRAND")).toBe("Ficha técnica (BRAND)");
    expect(reviewFieldLabel("unknown")).toBe("unknown");
    expect(REVIEW_FIELDS.every((field) => reviewFieldLabel(field) !== field)).toBe(true);
  });
});

describe("reviewQueueSearchSchema", () => {
  it("falls back to the first page and no filter on malformed URL values", () => {
    expect(reviewQueueSearchSchema.parse({ page: "abc", query: 12 })).toEqual({
      page: 1,
      query: undefined,
    });
    expect(reviewQueueSearchSchema.parse({ page: "3", query: "  tênis " })).toEqual({
      page: 3,
      query: "tênis",
    });
  });
});
