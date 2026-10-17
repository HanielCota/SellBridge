import { describe, expect, it } from "vitest";
import { rejectionReasonSchema } from "./supplier-panel-catalog-status.ts";
import {
  REVIEW_FIELDS,
  REVIEW_REASON_PRESETS,
  reasonFromPreset,
  reviewFieldLabel,
  reviewFieldOptions,
  reviewKindOf,
  reviewQueueSearchSchema,
  reviewReasonTitle,
} from "./supplier-product-review.ts";

describe("reviewKindOf", () => {
  const reviewedAt = new Date("2026-10-01T00:00:00Z");
  const reason = { field: "title", rule: "title_policy", message: "Revise o título" };

  it("reads a never-reviewed product as new and a reviewed one as a change", () => {
    expect(reviewKindOf({ reviewedAt: null, rejectionReasons: [] })).toBe("new");
    expect(reviewKindOf({ reviewedAt, rejectionReasons: [] })).toBe("change");
  });

  it("reads a product sent again after a rejection as a resubmission", () => {
    expect(reviewKindOf({ reviewedAt, rejectionReasons: [reason] })).toBe("resubmission");
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
    expect(reviewFieldLabel("attributes.BRAND")).toBe("Marca");
    expect(reviewFieldLabel("attributes.GTIN")).toBe("Código de barras (GTIN)");
    expect(reviewFieldLabel("attributes.SELLER_PACKAGE_WEIGHT")).toBe("Peso da embalagem");
    expect(reviewFieldLabel("unknown")).toBe("unknown");
    expect(REVIEW_FIELDS.every((field) => reviewFieldLabel(field) !== field)).toBe(true);
  });
});

describe("reviewReasonTitle", () => {
  it("names presets and the completeness items a reviewer turns into reasons", () => {
    expect(reviewReasonTitle("image_quality")).toBe("Imagem fora do padrão");
    expect(reviewReasonTitle("gtin_recommended")).toBe("Código de barras ausente");
    expect(reviewReasonTitle("package_recommended")).toBe("Embalagem sem peso ou medidas");
  });

  it("never shows a rule code to the reviewer", () => {
    expect(reviewReasonTitle("some_future_rule")).toBe("Outro motivo");
  });
});

describe("reviewFieldOptions", () => {
  it("offers the product fields, then the datasheet the product fills", () => {
    const options = reviewFieldOptions(["GTIN", "BRAND"], []);
    expect(options.slice(0, REVIEW_FIELDS.length).map((option) => option.value)).toEqual([
      ...REVIEW_FIELDS,
    ]);
    expect(options.slice(REVIEW_FIELDS.length)).toEqual([
      { value: "attributes.BRAND", label: "Marca" },
      { value: "attributes.GTIN", label: "Código de barras (GTIN)" },
    ]);
  });

  it("always offers the field a reason already points at, even an empty attribute", () => {
    const values = reviewFieldOptions([], ["attributes.GTIN", "title"]).map(
      (option) => option.value,
    );
    expect(values).toContain("attributes.GTIN");
    expect(values.filter((value) => value === "title")).toHaveLength(1);
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
