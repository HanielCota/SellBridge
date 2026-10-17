import { describe, expect, it } from "vitest";
import { catalogFixes, photoSkuOf, splitHomeOrders } from "./supplier-panel-home-queue.ts";

const stockRow = {
  productId: "p1",
  title: "Jarra 1 L",
  sku: "JAR-1",
  imageUrl: "https://example.com/jarra.jpg",
  availableStock: 0,
  activeListings: 3,
};

const rejectedRow = {
  productId: "p2",
  title: "Prato raso",
  sku: "PRA-27",
  imageUrl: null,
  rejectionReasons: [
    { field: "imageUrls" as const, rule: "image_background", message: "Fundo da foto escuro" },
  ],
};

describe("splitHomeOrders", () => {
  it("puts parcels waiting for the accept apart and keeps the urgency order", () => {
    const rows = [
      { id: "a", status: "ready" as const },
      { id: "b", status: "forwarded" as const },
      { id: "c", status: "accepted" as const },
      { id: "d", status: "forwarded" as const },
    ];
    const groups = splitHomeOrders(rows);
    expect(groups.accept.map((row) => row.id)).toEqual(["b", "d"]);
    expect(groups.progress.map((row) => row.id)).toEqual(["a", "c"]);
  });
});

describe("photoSkuOf", () => {
  it("uses the first item's SKU, and none when it is blank or missing", () => {
    expect(photoSkuOf([{ sku: "VAS-P" }, { sku: "BOW-5" }])).toBe("VAS-P");
    expect(photoSkuOf([{ sku: "" }])).toBeNull();
    expect(photoSkuOf([])).toBeNull();
  });
});

describe("catalogFixes", () => {
  it("lists out-of-stock products before rejected ones, with the reason in words", () => {
    const fixes = catalogFixes([stockRow], [rejectedRow]);
    expect(fixes.map((fix) => [fix.productId, fix.kind])).toEqual([
      ["p1", "out_of_stock"],
      ["p2", "rejected"],
    ]);
    expect(fixes[0]?.reason).toBe("Ainda à venda em 3 anúncios ativos");
    expect(fixes[1]?.reason).not.toBe("");
    expect(fixes[1]?.field).toBe("imageUrls");
  });

  it("leaves out products that still have stock or no live listing", () => {
    const withStock = { ...stockRow, availableStock: 2 };
    const unlisted = { ...stockRow, productId: "p3", activeListings: 0 };
    expect(catalogFixes([withStock, unlisted], [])).toEqual([]);
  });

  it("counts the other rejection reasons after the first one", () => {
    const reasons = [
      ...rejectedRow.rejectionReasons,
      { field: "title" as const, rule: "title_short", message: "Título muito curto" },
      { field: "description" as const, rule: "other", message: "Descrição vazia" },
    ];
    const [fix] = catalogFixes([], [{ ...rejectedRow, rejectionReasons: reasons }]);
    expect(fix?.reason).toMatch(/ e mais 2 motivos$/);
  });

  it("names the field to revise when the rule has no title of its own", () => {
    const reason = { field: "title" as const, rule: "gtin_mismatch", message: "Confira o código" };
    const [fix] = catalogFixes([], [{ ...rejectedRow, rejectionReasons: [reason] }]);
    expect(fix?.reason).toBe("Revisar título");
  });

  it("says the product was refused when the review left no reason", () => {
    const [fix] = catalogFixes([], [{ ...rejectedRow, rejectionReasons: [] }]);
    expect(fix?.reason).toBe("Reprovado na análise");
  });
});
