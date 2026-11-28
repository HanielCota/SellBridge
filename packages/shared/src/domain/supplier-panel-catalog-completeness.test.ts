import { describe, expect, it } from "vitest";
import {
  evaluateCompleteness,
  missingForSale,
  requiredAttributesFor,
  type CompletenessProduct,
} from "./supplier-panel-catalog-completeness.ts";
import { EMPTY_PRODUCT_FISCAL } from "./product-fiscal.ts";

const COMPLETE: CompletenessProduct = {
  sku: "CAM-001",
  title: "Camiseta básica algodão - Preta",
  description: "x".repeat(200),
  costCents: 2500,
  stock: 10,
  categoryId: "5b6f1d2e-0000-4000-8000-000000000001",
  imageUrls: ["https://a.test/1.jpg", "https://a.test/2.jpg", "https://a.test/3.jpg"],
  mercadoLivreAttributes: {
    GTIN: "7891234567895",
    BRAND: "Marca",
    MODEL: "Básica",
    SELLER_PACKAGE_WEIGHT: "300",
    SELLER_PACKAGE_HEIGHT: "5",
    SELLER_PACKAGE_WIDTH: "20",
    SELLER_PACKAGE_LENGTH: "30",
  },
};

function product(overrides: Partial<CompletenessProduct>): CompletenessProduct {
  return { ...COMPLETE, ...overrides };
}

describe("evaluateCompleteness", () => {
  it("scores a complete product at 100 with nothing to fix", () => {
    const report = evaluateCompleteness(COMPLETE);
    expect(report).toEqual({
      score: 100,
      blocking: [],
      improvements: [],
      fiscal: [],
      canSubmit: true,
    });
  });

  it("blocks a product from a category the marketplaces refuse", () => {
    const report = evaluateCompleteness(
      product({ title: "Suplemento em cápsulas 60 doses - Preta" }),
    );
    expect(report.canSubmit).toBe(false);
    expect(report.blocking).toEqual([
      {
        field: "title",
        rule: "prohibited_item",
        severity: "blocking",
        message: expect.stringContaining("Suplementos e encapsulados".toLowerCase()),
      },
    ]);
  });

  it("keeps a complete non-restricted tool eligible for submission", () => {
    const report = evaluateCompleteness(product({ title: "Pistola de cola quente 20W" }));
    expect(report.canSubmit).toBe(true);
    expect(report.blocking).toEqual([]);
  });

  it("lists every blocking rule of an empty draft with its field", () => {
    const report = evaluateCompleteness({
      sku: " ",
      title: "Curto",
      description: "",
      costCents: 0,
      stock: 0,
      categoryId: null,
      imageUrls: [],
      mercadoLivreAttributes: {},
    });
    expect(report.blocking.map((issue) => issue.field)).toEqual([
      "sku",
      "title",
      "costCents",
      "stock",
      "categoryId",
      "imageUrls",
    ]);
    expect(report.canSubmit).toBe(false);
    expect(report.score).toBe(0);
    expect(report.blocking[1]?.message).toBe("Use um título com pelo menos 10 caracteres");
  });

  it("keeps improvements apart from what blocks publishing", () => {
    const report = evaluateCompleteness(
      product({ description: "curta", imageUrls: ["https://a.test/1.jpg"] }),
    );
    expect(report.canSubmit).toBe(true);
    expect(report.blocking).toEqual([]);
    expect(report.improvements.map((issue) => issue.rule)).toEqual([
      "description_min_length",
      "images_recommended",
    ]);
    expect(report.improvements.every((issue) => issue.severity === "improvement")).toBe(true);
    expect(report.score).toBeLessThan(100);
    expect(report.score).toBeGreaterThan(80);
  });

  it("points the package rule at the first missing measure", () => {
    const report = evaluateCompleteness(
      product({
        mercadoLivreAttributes: { ...COMPLETE.mercadoLivreAttributes, SELLER_PACKAGE_WIDTH: " " },
      }),
    );
    expect(report.improvements).toEqual([
      expect.objectContaining({
        field: "attributes.SELLER_PACKAGE_WIDTH",
        rule: "package_recommended",
      }),
    ]);
  });

  it("asks for GTIN, brand and model only as improvements by default", () => {
    const report = evaluateCompleteness(product({ mercadoLivreAttributes: {} }));
    expect(report.canSubmit).toBe(true);
    expect(report.improvements.map((issue) => issue.field)).toEqual([
      "attributes.GTIN",
      "attributes.SELLER_PACKAGE_WEIGHT",
      "attributes.BRAND",
      "attributes.MODEL",
    ]);
  });

  it("blocks on attributes the category requires and stops suggesting them", () => {
    const report = evaluateCompleteness(
      product({ mercadoLivreAttributes: { BRAND: "Acme" } }),
      requiredAttributesFor("eletronicos"),
    );
    expect(report.blocking).toEqual([
      {
        field: "attributes.MODEL",
        rule: "attribute_required",
        severity: "blocking",
        message: "Informe modelo: o Mercado Livre exige nesta categoria",
      },
    ]);
    expect(report.improvements.some((issue) => issue.field === "attributes.MODEL")).toBe(false);
    expect(report.canSubmit).toBe(false);
  });

  it("only suggests a brand the category requires, since none goes as the generic brand", () => {
    const report = evaluateCompleteness(product({ mercadoLivreAttributes: { MODEL: "X1" } }), [
      ...requiredAttributesFor("eletronicos"),
      { id: "BRAND", label: "Marca" },
    ]);

    expect(report.blocking).toEqual([]);
    expect(report.canSubmit).toBe(true);
    expect(report.improvements.map((issue) => issue.field)).toContain("attributes.BRAND");
  });

  it("weighs a blocking rule more than an improvement", () => {
    const missingImage = evaluateCompleteness(product({ costCents: 0 }));
    const shortDescription = evaluateCompleteness(product({ description: "" }));
    expect(missingImage.score).toBeLessThan(shortDescription.score);
  });
});

describe("requiredAttributesFor", () => {
  it("returns the category's attributes, or none for unknown or missing slugs", () => {
    expect(requiredAttributesFor("calcados").map((attribute) => attribute.id)).toEqual([
      "GENDER",
      "SIZE",
    ]);
    expect(requiredAttributesFor("papelaria")).toEqual([]);
    expect(requiredAttributesFor(null)).toEqual([]);
    expect(requiredAttributesFor(undefined)).toEqual([]);
  });
});

describe("evaluateCompleteness fiscal data", () => {
  const withoutNcm = { ...EMPTY_PRODUCT_FISCAL, origin: 0, unit: "UN" as const };

  it("blocks publishing a new product without NCM, origin and unit", () => {
    const report = evaluateCompleteness(product({ fiscal: withoutNcm, fiscalRequired: true }));

    expect(report.canSubmit).toBe(false);
    expect(report.blocking).toEqual([
      expect.objectContaining({ field: "fiscal.ncm", rule: "fiscal_required" }),
    ]);
  });

  it("keeps an existing product sellable and lists the missing data apart", () => {
    const report = evaluateCompleteness(product({ fiscal: withoutNcm, fiscalRequired: false }));

    expect(report.canSubmit).toBe(true);
    expect(report.fiscal).toEqual([
      expect.objectContaining({ field: "fiscal.ncm", severity: "fiscal" }),
    ]);
  });

  it("asks only for what is still empty, so origin and unit from Marca are not asked again", () => {
    const report = evaluateCompleteness(product({ fiscal: withoutNcm, fiscalRequired: false }));

    expect(report.fiscal[0]?.message).toBe("Informe NCM. O produto continua à venda.");
  });

  it("asks for NCM, origin and unit when all three are empty", () => {
    const report = evaluateCompleteness(
      product({ fiscal: EMPTY_PRODUCT_FISCAL, fiscalRequired: true }),
    );

    expect(report.blocking[0]?.message).toBe("Informe NCM, origem e unidade para publicar");
  });

  it("asks nothing fiscal of a product with NCM, origin and unit", () => {
    const fiscal = { ...withoutNcm, ncm: "61091000" };

    const report = evaluateCompleteness(product({ fiscal, fiscalRequired: true }));

    expect(report.blocking).toEqual([]);
    expect(report.fiscal).toEqual([]);
  });
});

describe("evaluateCompleteness shipping weight", () => {
  const noPackage = {
    GTIN: "7891234567895",
    BRAND: "Marca",
    MODEL: "Básica",
  };

  it("blocks publishing a new product without any weight", () => {
    const report = evaluateCompleteness(
      product({ mercadoLivreAttributes: noPackage, weightRequired: true }),
    );

    expect(report.canSubmit).toBe(false);
    expect(report.blocking).toEqual([
      expect.objectContaining({
        field: "attributes.SELLER_PACKAGE_WEIGHT",
        rule: "weight_required",
      }),
    ]);
  });

  it("accepts a new product with the packed weight", () => {
    const report = evaluateCompleteness(product({ weightRequired: true }));

    expect(report.canSubmit).toBe(true);
    expect(report.blocking).toEqual([]);
  });

  it("accepts a new product with only its own weight from the NF-e data", () => {
    const report = evaluateCompleteness(
      product({
        mercadoLivreAttributes: noPackage,
        fiscal: { ...EMPTY_PRODUCT_FISCAL, netWeightGrams: 900 },
        weightRequired: true,
      }),
    );

    expect(report.blocking).toEqual([]);
  });

  it("blocks a new product whose packed weight cannot be read", () => {
    const report = evaluateCompleteness(
      product({
        mercadoLivreAttributes: { ...noPackage, SELLER_PACKAGE_WEIGHT: "0,5 kg" },
        weightRequired: true,
      }),
    );

    expect(report.canSubmit).toBe(false);
  });

  it("keeps an existing product without weight sellable and says shipping is estimated", () => {
    const report = evaluateCompleteness(
      product({ mercadoLivreAttributes: noPackage, weightRequired: false }),
    );

    expect(report.canSubmit).toBe(true);
    expect(report.improvements).toEqual([
      expect.objectContaining({
        rule: "package_recommended",
        message:
          "Informe o peso da embalagem: sem ele, o frete dos revendedores é estimado para até 0,5 kg",
      }),
    ]);
  });
});

describe("missingForSale", () => {
  it("names every NF-e field and the weight a team product still misses", () => {
    const missing = missingForSale({
      fiscal: EMPTY_PRODUCT_FISCAL,
      fiscalRequired: true,
      weightRequired: true,
      mercadoLivreAttributes: {},
    });

    expect(missing).toEqual(["NCM", "origem", "unidade", "peso"]);
  });

  it("asks nothing of a product created before the rules", () => {
    const missing = missingForSale({
      fiscal: EMPTY_PRODUCT_FISCAL,
      fiscalRequired: false,
      weightRequired: false,
      mercadoLivreAttributes: {},
    });

    expect(missing).toEqual([]);
  });
});
