import { describe, expect, it } from "vitest";
import {
  combinationOwnFields,
  combinationTitle,
  type GridCombination,
  gridAxisAttributes,
  gridProblems,
  MAX_GRID_COMBINATIONS,
  MAX_MODEL_TITLE_LENGTH,
  materializeCombination,
  modelCodeFromTitle,
  productGridDraftSchema,
  productGridSchema,
  type ProductModelShared,
  sharedAttributes,
  sortSizeNames,
} from "./product-grid.ts";

function combination(
  color: string | null,
  size: string | null,
  sku: string,
  overrides: Partial<GridCombination> = {},
): GridCombination {
  return {
    color,
    size,
    sku,
    gtin: null,
    costCents: 5000,
    suggestedPriceCents: 9990,
    stock: 3,
    netWeightGrams: null,
    ...overrides,
  };
}

const shoeGrid = {
  colors: [
    { name: "Preto", imageUrls: ["https://cdn.example.com/preto.jpg"] },
    { name: "Branco", imageUrls: [] },
  ],
  sizes: ["38", "39"],
  combinations: [
    combination("Preto", "38", "TEN-P-38"),
    combination("Preto", "39", "TEN-P-39"),
    combination("Branco", "38", "TEN-B-38"),
  ],
};

const model: ProductModelShared = {
  title: "Tênis Casual",
  description: "Couro legítimo",
  categoryId: null,
  imageUrls: ["https://cdn.example.com/capa.jpg"],
  mercadoLivreAttributes: { BRAND: "Pegada", MODEL: "Casual", GTIN: "7891234567895" },
  mercadoLivreCategoryId: "MLB23332",
  mercadoLivreCategoryName: "Tênis",
  warrantyType: "seller",
  warrantyDays: 90,
  videoUrl: null,
  madeToOrderDays: null,
  carrierOnly: false,
  fiscal: { ncm: "64039990", origin: 0, unit: "PAR", netWeightGrams: 800 },
};

describe("gridProblems", () => {
  it("accepts a grid that skips a pair of colour and size", () => {
    expect(gridProblems(shoeGrid)).toEqual([]);
  });

  it("accepts a grid with sizes only", () => {
    const grid = {
      colors: [],
      sizes: ["P", "M"],
      combinations: [combination(null, "P", "C-P"), combination(null, "M", "C-M")],
    };

    expect(gridProblems(grid)).toEqual([]);
  });

  it("asks for a colour or a size when both lists are empty", () => {
    expect(gridProblems({ colors: [], sizes: [], combinations: [] })).toEqual([
      "Informe pelo menos uma cor ou um tamanho",
    ]);
  });

  it("asks for a combination when the grid has options but none is sold", () => {
    expect(gridProblems({ ...shoeGrid, combinations: [] })).toEqual([
      "Informe pelo menos uma combinação de cor e tamanho",
    ]);
  });

  it("refuses more combinations than Shopee accepts, naming the count", () => {
    const sizes = Array.from({ length: MAX_GRID_COMBINATIONS + 1 }, (_, index) => `${index + 1}`);
    const grid = {
      colors: [],
      sizes,
      combinations: sizes.map((size) => combination(null, size, `S-${size}`)),
    };

    expect(gridProblems(grid)).toEqual([
      "A grade pode ter até 50 combinações (recebido: 51). Divida em dois modelos.",
    ]);
  });

  it("treats colour names that differ only in case or accents as the same colour", () => {
    const grid = {
      ...shoeGrid,
      colors: [...shoeGrid.colors, { name: "preto ", imageUrls: [] }],
    };

    expect(gridProblems(grid)).toContain('A cor "preto " aparece mais de uma vez');
  });

  it("treats colour names that differ only in the spaces between words as the same colour", () => {
    const grid = {
      ...shoeGrid,
      colors: [
        { name: "Azul Marinho", imageUrls: [] },
        { name: "Azul  Marinho", imageUrls: [] },
      ],
      combinations: [
        combination("Azul Marinho", "38", "A-38"),
        combination("Azul  Marinho", "39", "A-39"),
      ],
    };

    expect(gridProblems(grid)).toContain('A cor "Azul  Marinho" aparece mais de uma vez');
  });

  it("names the SKU whose colour is missing from the grid", () => {
    const grid = {
      ...shoeGrid,
      combinations: [...shoeGrid.combinations, combination("Azul", "38", "TEN-A-38")],
    };

    expect(gridProblems(grid)).toContain('A cor "Azul" do código TEN-A-38 não está na grade');
  });

  it("asks for the size of a combination when the grid has sizes", () => {
    const grid = {
      ...shoeGrid,
      combinations: [...shoeGrid.combinations, combination("Branco", null, "TEN-B")],
    };

    expect(gridProblems(grid)).toContain("Escolha o tamanho do código TEN-B");
  });

  it("refuses a colour on a grid that has only sizes", () => {
    const grid = {
      colors: [],
      sizes: ["P"],
      combinations: [combination("Preto", "P", "C-P")],
    };

    expect(gridProblems(grid)).toEqual(["O código C-P tem cor, mas a grade não tem cor"]);
  });

  it("refuses the same combination twice and the same SKU twice", () => {
    const grid = {
      ...shoeGrid,
      combinations: [...shoeGrid.combinations, combination("Preto", "38", "TEN-P-39")],
    };

    expect(gridProblems(grid)).toEqual([
      "A combinação Preto 38 aparece mais de uma vez",
      "O código TEN-P-39 aparece em mais de uma combinação",
    ]);
  });

  it("refuses a size that no combination sells", () => {
    const grid = { ...shoeGrid, sizes: [...shoeGrid.sizes, "40"] };

    expect(gridProblems(grid)).toEqual(['O tamanho "40" não tem nenhuma combinação']);
  });
});

describe("productGridSchema", () => {
  it("trims option names before checking them", () => {
    const parsed = productGridSchema.parse({
      ...shoeGrid,
      sizes: [" 38 ", "39"],
      combinations: shoeGrid.combinations.map((entry) => ({ ...entry, color: ` ${entry.color}` })),
    });

    expect(parsed.sizes).toEqual(["38", "39"]);
    expect(parsed.combinations[0]?.color).toBe("Preto");
  });

  it("refuses a barcode with a wrong check digit", () => {
    const result = productGridSchema.safeParse({
      ...shoeGrid,
      combinations: [
        combination("Preto", "38", "TEN-P-38", { gtin: "7891234567890" }),
        ...shoeGrid.combinations.slice(1),
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("combinationTitle", () => {
  it("joins the model title with colour and size", () => {
    expect(combinationTitle("Tênis Casual", "Preto", "38")).toBe("Tênis Casual - Preto 38");
  });

  it("keeps a model title at its limit within the product title limit", () => {
    const title = combinationTitle(
      "a".repeat(MAX_MODEL_TITLE_LENGTH),
      "c".repeat(40),
      "s".repeat(40),
    );

    expect(title.length).toBeLessThanOrEqual(300);
  });
});

describe("sortSizeNames", () => {
  it("orders numbered sizes by number", () => {
    expect(sortSizeNames(["40", "38", "39", "37/38"])).toEqual(["37/38", "38", "39", "40"]);
  });

  it("orders letter sizes from small to big", () => {
    expect(sortSizeNames(["GG", "P", "M", "XG", "G", "PP"])).toEqual([
      "PP",
      "P",
      "M",
      "G",
      "GG",
      "XG",
    ]);
  });

  it("keeps unknown sizes last, in the order given", () => {
    expect(sortSizeNames(["Único", "M", "Infantil", "P"])).toEqual(["P", "M", "Único", "Infantil"]);
  });
});

describe("materializeCombination", () => {
  it("names the combination and uses its colour's photos", () => {
    const product = materializeCombination(model, {
      color: "Preto",
      size: "38",
      colorImageUrls: ["https://cdn.example.com/preto.jpg"],
      variantAttributes: {},
      variantFiscal: {},
    });

    expect(product.title).toBe("Tênis Casual - Preto 38");
    expect(product.imageUrls).toEqual(["https://cdn.example.com/preto.jpg"]);
    expect(product.mercadoLivreCategoryId).toBe("MLB23332");
  });

  it("falls back to the model's photos when the colour has none", () => {
    const product = materializeCombination(model, {
      color: "Branco",
      size: "38",
      colorImageUrls: [],
      variantAttributes: {},
      variantFiscal: {},
    });

    expect(product.imageUrls).toEqual(["https://cdn.example.com/capa.jpg"]);
  });

  it("never gives a combination the model's barcode, only its own", () => {
    const withoutOwn = materializeCombination(model, {
      color: "Preto",
      size: "38",
      colorImageUrls: [],
      variantAttributes: {},
      variantFiscal: {},
    });
    const withOwn = materializeCombination(model, {
      color: "Preto",
      size: "39",
      colorImageUrls: [],
      variantAttributes: { GTIN: "7891234567895" },
      variantFiscal: {},
    });

    expect(withoutOwn.mercadoLivreAttributes).toEqual({
      BRAND: "Pegada",
      MODEL: "Casual",
      COLOR: "Preto",
      SIZE: "38",
    });
    expect(withOwn.mercadoLivreAttributes.GTIN).toBe("7891234567895");
  });

  it("names its own colour and size in the sheet, never the model's", () => {
    const product = materializeCombination(
      { ...model, mercadoLivreAttributes: { BRAND: "Pegada", COLOR: "Azul", SIZE: "44" } },
      {
        color: "Preto",
        size: "38",
        colorImageUrls: [],
        variantAttributes: {},
        variantFiscal: {},
      },
    );

    expect(product.mercadoLivreAttributes).toEqual({ BRAND: "Pegada", COLOR: "Preto", SIZE: "38" });
  });

  it("keeps the model's colour for a shoe sold by size only", () => {
    const product = materializeCombination(
      { ...model, mercadoLivreAttributes: { BRAND: "Pegada", COLOR: "Marinho" } },
      {
        color: null,
        size: "33/34",
        colorImageUrls: [],
        variantAttributes: {},
        variantFiscal: {},
      },
    );

    expect(product.mercadoLivreAttributes).toEqual({
      BRAND: "Pegada",
      COLOR: "Marinho",
      SIZE: "33/34",
    });
  });

  it("inherits the model's fiscal fields and lets the combination override its weight", () => {
    const inherited = materializeCombination(model, {
      color: "Preto",
      size: "38",
      colorImageUrls: [],
      variantAttributes: {},
      variantFiscal: { netWeightGrams: null },
    });
    const overridden = materializeCombination(model, {
      color: "Preto",
      size: "44",
      colorImageUrls: [],
      variantAttributes: {},
      variantFiscal: { netWeightGrams: 950 },
    });

    expect(inherited.fiscal).toEqual(model.fiscal);
    expect(overridden.fiscal).toEqual({ ...model.fiscal, netWeightGrams: 950 });
  });
});

describe("gridAxisAttributes", () => {
  it("leaves the colour in the model's sheet when the grid has sizes only", () => {
    const axes = gridAxisAttributes({ hasColors: false, hasSizes: true });

    expect([...axes]).toEqual(["SIZE"]);
  });

  it("answers colour and size while the grid has neither yet", () => {
    const axes = gridAxisAttributes({ hasColors: false, hasSizes: false });

    expect([...axes].toSorted()).toEqual(["COLOR", "MAIN_COLOR", "SIZE"]);
  });
});

describe("sharedAttributes", () => {
  it("keeps the model's colour when the grid has sizes only", () => {
    const shared = sharedAttributes(
      { BRAND: "Pegada", COLOR: "Marinho", SIZE: "38", GTIN: "7891234567895" },
      { hasColors: false, hasSizes: true },
    );

    expect(shared).toEqual({ BRAND: "Pegada", COLOR: "Marinho" });
  });

  it("drops colour and size when the grid has both", () => {
    const shared = sharedAttributes(
      { BRAND: "Pegada", COLOR: "Marinho", MAIN_COLOR: "Azul", SIZE: "38" },
      { hasColors: true, hasSizes: true },
    );

    expect(shared).toEqual({ BRAND: "Pegada" });
  });
});

describe("combinationOwnFields", () => {
  it("keeps the barcode and weight the combination was given", () => {
    const own = combinationOwnFields(
      combination("Preto", "38", "TEN-P-38", { gtin: "7891234567895", netWeightGrams: 780 }),
    );

    expect(own).toEqual({
      variantAttributes: { GTIN: "7891234567895" },
      variantFiscal: { netWeightGrams: 780 },
    });
  });
});

describe("productGridDraftSchema", () => {
  it("saves a grid still being typed: a colour without combinations yet", () => {
    const result = productGridDraftSchema.safeParse({
      colors: [{ name: "Preto", imageUrls: [] }],
      sizes: [{ name: "38" }],
      combinations: [],
    });

    expect(result.success).toBe(true);
  });

  it("never saves the same SKU on two combinations", () => {
    const result = productGridDraftSchema.safeParse({
      colors: [{ name: "Preto", imageUrls: [] }],
      sizes: [{ name: "38" }, { name: "39" }],
      combinations: [combination("Preto", "38", "TEN-1"), combination("Preto", "39", "TEN-1")],
    });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "O código TEN-1 aparece em mais de uma combinação",
    ]);
  });
});

describe("modelCodeFromTitle", () => {
  it("turns the title into a code without accents or spaces", () => {
    expect(modelCodeFromTitle("Tênis Casual Couro – Linha 2")).toBe("TENIS-CASUAL-COURO-LINHA-2");
  });

  it("falls back to MODELO when the title has no letters or numbers", () => {
    expect(modelCodeFromTitle("  —  ")).toBe("MODELO");
  });
});
