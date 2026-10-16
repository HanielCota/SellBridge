import { describe, expect, it } from "vitest";
import { isOutOfStock, planBulkPublish, type BulkPublishProduct } from "./bulk-publish-plan.ts";

const valid: BulkPublishProduct = {
  id: "p-valid",
  title: "Garrafa térmica de aço inox 1 litro",
  description: "Mantém a bebida quente por 12 horas e gelada por 24 horas.",
  stock: 12,
  published: false,
};

function plan(
  products: BulkPublishProduct[],
  requestedIds = products.map((product) => product.id),
) {
  return planBulkPublish({ requestedIds, products, safetyUnits: 0 });
}

describe("isOutOfStock", () => {
  it("counts the safety units the sync keeps off the marketplaces", () => {
    expect(isOutOfStock(0, 0)).toBe(true);
    expect(isOutOfStock(1, 0)).toBe(false);
    expect(isOutOfStock(2, 2)).toBe(true);
    expect(isOutOfStock(3, 2)).toBe(false);
  });
});

describe("planBulkPublish", () => {
  it("publishes the valid products with the same title and description rules as one at a time", () => {
    expect(plan([valid])).toEqual({
      drafts: [
        {
          supplierProductId: "p-valid",
          title: "Garrafa térmica de aço inox 1 litro",
          description: valid.description,
        },
      ],
      skipped: [],
    });
  });

  it("says why each product was left out, in the order they were asked", () => {
    const result = plan(
      [
        { ...valid, id: "p-published", published: true },
        { ...valid, id: "p-empty", stock: 0 },
        { ...valid, id: "p-title", title: "Curto" },
        { ...valid, id: "p-description", description: "Pouco texto" },
        valid,
      ],
      ["p-published", "p-empty", "p-title", "p-gone", "p-description", "p-valid"],
    );
    expect(result.drafts.map((draft) => draft.supplierProductId)).toEqual(["p-valid"]);
    expect(result.skipped).toEqual([
      { productId: "p-published", title: valid.title, reason: "already_published" },
      { productId: "p-empty", title: valid.title, reason: "out_of_stock" },
      { productId: "p-title", title: "Curto", reason: "invalid_title" },
      { productId: "p-gone", title: null, reason: "unavailable" },
      { productId: "p-description", title: valid.title, reason: "invalid_description" },
    ]);
  });

  it("keeps the safety units out of what can be published", () => {
    const result = planBulkPublish({
      requestedIds: ["p-valid"],
      products: [{ ...valid, stock: 2 }],
      safetyUnits: 2,
    });
    expect(result.drafts).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("out_of_stock");
  });

  it("asks each product once, however often it was picked", () => {
    const result = plan([valid], ["p-valid", "p-valid"]);
    expect(result.drafts).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });
});
