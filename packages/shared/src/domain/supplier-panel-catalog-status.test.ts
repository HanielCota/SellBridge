import { describe, expect, it } from "vitest";
import {
  catalogDraftValuesSchema,
  catalogListSearchSchema,
  catalogRejectSchema,
} from "./supplier-panel-catalog-schemas.ts";
import {
  changedProductFields,
  rejectionReasonSchema,
  reviewTransition,
  statusAfterEdit,
  submitTransition,
  type EditableProductFields,
  type ProductReviewStatus,
} from "./supplier-panel-catalog-status.ts";

const BASE: EditableProductFields = {
  sku: "CAM-001",
  title: "Camiseta básica",
  description: "",
  costCents: 2500,
  suggestedPriceCents: 4990,
  stock: 10,
  categoryId: null,
  imageUrls: ["https://a.test/1.jpg"],
  mercadoLivreAttributes: { BRAND: "Marca" },
};

describe("submitTransition", () => {
  it("sends a draft with nothing blocking to review", () => {
    expect(submitTransition("draft", 0)).toEqual({ allowed: true, next: "in_review" });
  });

  it("refuses a draft with blocking issues and says how many", () => {
    expect(submitTransition("draft", 1)).toEqual({
      allowed: false,
      message: "Corrija 1 pendência que impede publicar antes de enviar",
    });
    expect(submitTransition("draft", 3)).toMatchObject({
      message: "Corrija 3 pendências que impedem publicar antes de enviar",
    });
  });

  it("refuses anything that is not a draft", () => {
    expect(submitTransition("rejected", 0)).toEqual({
      allowed: false,
      message: "Só um rascunho pode ser enviado para análise (status atual: Reprovado)",
    });
  });
});

describe("reviewTransition", () => {
  it("approves or rejects a product under review", () => {
    expect(reviewTransition("in_review", "approve")).toEqual({ allowed: true, next: "approved" });
    expect(reviewTransition("in_review", "reject")).toEqual({ allowed: true, next: "rejected" });
  });

  it("refuses to review a product that is not waiting", () => {
    expect(reviewTransition("approved", "reject")).toMatchObject({ allowed: false });
  });
});

function edit(current: ProductReviewStatus, fields: string[]): ProductReviewStatus {
  return statusAfterEdit({ current, changedFields: fields, blockingIssueCount: 0 });
}

describe("statusAfterEdit", () => {
  it("keeps the status when nothing changed", () => {
    expect(edit("rejected", [])).toBe("rejected");
  });

  it("turns a rejected product back into a draft on edit", () => {
    expect(edit("rejected", ["description"])).toBe("draft");
    expect(edit("draft", ["title"])).toBe("draft");
  });

  it("sends an approved product back to review when title, images or category change", () => {
    expect(edit("approved", ["title"])).toBe("in_review");
    expect(edit("approved", ["imageUrls"])).toBe("in_review");
    expect(edit("approved", ["categoryId", "stock"])).toBe("in_review");
  });

  it("keeps an approved product approved when only stock or cost change", () => {
    expect(edit("approved", ["stock", "costCents"])).toBe("approved");
  });

  it("keeps a product under review in review, or drops it to draft when something blocks", () => {
    expect(edit("in_review", ["description"])).toBe("in_review");
    expect(
      statusAfterEdit({ current: "approved", changedFields: ["imageUrls"], blockingIssueCount: 1 }),
    ).toBe("draft");
  });
});

describe("changedProductFields", () => {
  it("finds no change between equal products", () => {
    expect(changedProductFields(BASE, { ...BASE, imageUrls: [...BASE.imageUrls] })).toEqual([]);
  });

  it("names each changed scalar, the image list and the attributes", () => {
    const after: EditableProductFields = {
      ...BASE,
      title: "Outro título",
      stock: 3,
      imageUrls: ["https://a.test/2.jpg"],
      mercadoLivreAttributes: { BRAND: "Outra" },
    };
    expect(changedProductFields(BASE, after)).toEqual([
      "title",
      "stock",
      "imageUrls",
      "mercadoLivreAttributes",
    ]);
  });

  it("sees added images and attributes", () => {
    const after: EditableProductFields = {
      ...BASE,
      imageUrls: [...BASE.imageUrls, "https://a.test/2.jpg"],
      mercadoLivreAttributes: { ...BASE.mercadoLivreAttributes, MODEL: "X" },
    };
    expect(changedProductFields(BASE, after)).toEqual(["imageUrls", "mercadoLivreAttributes"]);
  });
});

describe("rejection reasons", () => {
  it("accepts a reason pointing at a field or an attribute", () => {
    const reason = { field: "attributes.BRAND", rule: "brand_mismatch", message: "Marca errada" };
    expect(rejectionReasonSchema.parse(reason)).toEqual(reason);
  });

  it("refuses unknown fields and an empty reason list", () => {
    expect(
      rejectionReasonSchema.safeParse({ field: "price", rule: "x_y", message: "Motivo" }).success,
    ).toBe(false);
    const reject = catalogRejectSchema.safeParse({
      supplierId: "5b6f1d2e-0000-4000-8000-000000000001",
      productId: "5b6f1d2e-0000-4000-8000-000000000002",
      reasons: [],
    });
    expect(reject.error?.issues[0]?.message).toBe("Informe pelo menos um motivo da reprovação");
  });
});

describe("catalog schemas", () => {
  it("falls back to defaults on malformed list filters", () => {
    expect(
      catalogListSearchSchema.parse({ status: "nope", sort: "price", page: "-1", pageSize: "7" }),
    ).toEqual({
      status: "all",
      query: undefined,
      sort: "updatedAt",
      direction: "desc",
      page: 1,
      pageSize: 25,
    });
  });

  it("stores a draft with an empty title but never without a SKU", () => {
    const draft = {
      sku: "A",
      title: "",
      description: "",
      costCents: 0,
      suggestedPriceCents: 0,
      stock: 0,
      categoryId: null,
      imageUrls: [],
    };
    expect(catalogDraftValuesSchema.safeParse(draft).success).toBe(true);
    expect(catalogDraftValuesSchema.safeParse({ ...draft, sku: " " }).success).toBe(false);
  });
});
