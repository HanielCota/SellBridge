import { describe, expect, it } from "vitest";
import {
  categoryIdOfNiche,
  completenessInput,
  descriptionLengthHint,
  editedFields,
  initialFormValues,
  inputIdOf,
  panelFormValues,
  EMPTY_PRODUCT_FISCAL_FORM_VALUES,
  parseDraft,
  FORM_STEPS,
  phoneStepLine,
  stepOfField,
  withSuggestedPriceFollowingCost,
  type PanelFormValues,
} from "./draft-form";
import { saleTermsFormValues } from "./sale-terms-form";

const FILLED: PanelFormValues = {
  sku: "CAM-1",
  title: "Camiseta básica",
  description: "",
  cost: "25,90",
  suggestedPrice: "",
  stock: "8",
  categoryId: "",
  imageUrls: ["https://imagens.test/1.jpg"],
  attributes: { BRAND: " Marca ", MODEL: " " },
  mercadoLivreCategory: null,
  saleTerms: saleTermsFormValues(),
  fiscal: EMPTY_PRODUCT_FISCAL_FORM_VALUES,
};

const STORED = {
  sku: "A",
  title: "T",
  description: "",
  costCents: 2590,
  suggestedPriceCents: 4990,
  stock: 3,
  categoryId: null,
  imageUrls: [],
  mercadoLivreAttributes: {},
};

describe("initialFormValues", () => {
  it("starts a new product with the supplier's default origin and unit", () => {
    const values = initialFormValues(null, {
      fiscal: { origin: 0, unit: "UN" },
      categoryId: null,
    });

    expect(values.fiscal).toMatchObject({ origin: "0", unit: "UN", ncm: "" });
  });

  it("keeps a stored product's own origin and unit", () => {
    const values = initialFormValues(STORED, {
      fiscal: { origin: 0, unit: "UN" },
      categoryId: "beauty",
    });

    expect(values.fiscal).toMatchObject({ origin: "", unit: "" });
    expect(values.categoryId).toBe("");
  });

  // Regression: a brand that sells "Beleza e cuidados" opened every new product with no category.
  it("starts a new product in the category of the brand's niche", () => {
    const categoryId = categoryIdOfNiche(
      [
        { id: "shoes", name: "Calçados" },
        { id: "beauty", name: "Beleza e cuidados" },
      ],
      "Beleza e cuidados",
    );

    const values = initialFormValues(null, { fiscal: null, categoryId });

    expect(values.categoryId).toBe("beauty");
  });

  it("leaves the category to choose when no category has the niche's name", () => {
    expect(
      categoryIdOfNiche([{ id: "beauty", name: "Beleza e cuidados" }], "Cosméticos"),
    ).toBeNull();
    expect(categoryIdOfNiche([{ id: "beauty", name: "Beleza e cuidados" }], null)).toBeNull();
  });
});

describe("panelFormValues", () => {
  it("starts a new product blank", () => {
    expect(panelFormValues()).toMatchObject({ sku: "", cost: "", stock: "", imageUrls: [] });
  });

  it("shows a stored product in input format", () => {
    const values = panelFormValues({
      sku: "A",
      title: "T",
      description: "",
      costCents: 2590,
      suggestedPriceCents: 4990,
      stock: 3,
      categoryId: null,
      imageUrls: [],
      mercadoLivreAttributes: { BRAND: "X" },
    });
    expect(values).toMatchObject({ cost: "25,90", suggestedPrice: "49,90", stock: "3" });
    expect(values.categoryId).toBe("");
  });
});

describe("parseDraft", () => {
  it("sends the Mercado Livre category only once one is known", () => {
    const withCategory = parseDraft({
      ...FILLED,
      mercadoLivreCategory: { id: "MLB7022", name: "Bolsas" },
    });
    const without = parseDraft(FILLED);

    expect(withCategory).toMatchObject({
      ok: true,
      values: { mercadoLivreCategoryId: "MLB7022", mercadoLivreCategoryName: "Bolsas" },
    });
    expect(without.ok && "mercadoLivreCategoryId" in without.values).toBe(false);
  });

  it("converts money and units and drops emptied attributes", () => {
    expect(parseDraft(FILLED)).toEqual({
      ok: true,
      values: expect.objectContaining({
        costCents: 2590,
        suggestedPriceCents: 3890,
        stock: 8,
        categoryId: null,
        mercadoLivreAttributes: { BRAND: "Marca" },
      }),
    });
  });

  it("saves a product left without a suggested price at the cost plus 50%, never at zero", () => {
    const parsed = parseDraft({ ...FILLED, cost: "30,00", suggestedPrice: "" });

    expect(parsed.ok ? parsed.values.suggestedPriceCents : parsed.errors).toBe(4590);
  });

  it("leaves the suggested price for later while the cost is not typed yet", () => {
    const parsed = parseDraft({ ...FILLED, cost: "", suggestedPrice: "" });

    expect(parsed.ok ? parsed.values.suggestedPriceCents : parsed.errors).toBe(0);
  });

  it("refuses a suggested price of zero, saying how to fix it", () => {
    const parsed = parseDraft({ ...FILLED, suggestedPrice: "0,00" });

    expect(parsed.ok ? parsed.values : parsed.errors.suggestedPriceCents).toMatch(
      /maior que R\$ 0,00/,
    );
  });

  it("holds the save while a value is half typed, naming the field", () => {
    const parsed = parseDraft({ ...FILLED, cost: "12,", stock: "dois", sku: "" });
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? {} : Object.keys(parsed.errors).toSorted()).toEqual([
      "costCents",
      "sku",
      "stock",
    ]);
  });

  it("reads a stock typed with a thousands dot as the whole count", () => {
    const parsed = parseDraft({ ...FILLED, stock: "1.000" });

    expect(parsed.ok ? parsed.values.stock : parsed.errors).toBe(1000);
  });

  it("holds the save when the stock has a fraction", () => {
    const parsed = parseDraft({ ...FILLED, stock: "1.5" });

    expect(parsed.ok ? parsed.values.stock : Object.keys(parsed.errors)).toEqual(["stock"]);
  });

  it("saves a product whose shelf went below zero when the count is left as it opened", () => {
    const parsed = parseDraft({ ...FILLED, stock: "-3" }, -3);
    expect(parsed.ok ? parsed.values.stock : parsed.errors).toBe(-3);
  });

  it("holds the save when a negative shelf count is typed", () => {
    const parsed = parseDraft({ ...FILLED, stock: "-1" }, 5);
    expect(parsed.ok ? {} : parsed.errors).toEqual({ stock: "O estoque não pode ser negativo" });
  });

  it("points a bad image link at the image step", () => {
    const parsed = parseDraft({ ...FILLED, imageUrls: ["ftp://x"] });
    expect(parsed.ok ? [] : Object.keys(parsed.errors)).toEqual(["imageUrls"]);
  });
});

describe("withSuggestedPriceFollowingCost", () => {
  it("fills the suggested price from the cost while the supplier has not changed it", () => {
    const empty = { ...FILLED, cost: "", suggestedPrice: "" };

    const first = withSuggestedPriceFollowingCost(empty, { cost: "30,00" });
    const second = withSuggestedPriceFollowingCost({ ...empty, ...first }, { cost: "40,00" });

    expect(first).toEqual({ cost: "30,00", suggestedPrice: "45,90" });
    expect(second).toEqual({ cost: "40,00", suggestedPrice: "60,90" });
  });

  it("keeps a suggested price the supplier typed when the cost changes", () => {
    const typed = { ...FILLED, cost: "30,00", suggestedPrice: "59,90" };

    expect(withSuggestedPriceFollowingCost(typed, { cost: "40,00" })).toEqual({ cost: "40,00" });
  });
});

describe("panelFormValues suggested price", () => {
  it("shows the cost plus 50% for a stored product saved at zero", () => {
    const values = panelFormValues({ ...STORED, suggestedPriceCents: 0 });

    expect(values.suggestedPrice).toBe("38,90");
  });
});

describe("completenessInput", () => {
  it("counts blanks and typos as missing", () => {
    expect(completenessInput({ ...FILLED, cost: "abc", stock: "" })).toMatchObject({
      costCents: 0,
      stock: 0,
      categoryId: null,
      mercadoLivreAttributes: { BRAND: "Marca" },
    });
  });

  it("counts a stock typed with a thousands dot", () => {
    expect(completenessInput({ ...FILLED, stock: "1.000" }).stock).toBe(1000);
  });
});

describe("field navigation", () => {
  it("maps each field to its step and input id", () => {
    expect(stepOfField("categoryId")).toBe("category");
    expect(stepOfField("imageUrls")).toBe("images");
    expect(stepOfField("attributes.BRAND")).toBe("details");
    expect(inputIdOf("attributes.BRAND")).toBe("panel-product-attributes-BRAND");
  });
});

describe("descriptionLengthHint", () => {
  it("counts toward the recommended length while the text is short", () => {
    expect(descriptionLengthHint(120)).toBe("120 de 200 caracteres recomendados");
  });

  it("stops counting toward a goal the text already passed", () => {
    expect(descriptionLengthHint(200)).toBe("200 caracteres: tamanho recomendado atingido");
    expect(descriptionLengthHint(254)).toBe("254 caracteres: tamanho recomendado atingido");
  });
});

describe("editedFields", () => {
  it("names each field changed since the form opened, by its product field key", () => {
    const edited = editedFields(FILLED, {
      ...FILLED,
      cost: "26,90",
      imageUrls: [...FILLED.imageUrls, "https://imagens.test/2.jpg"],
      attributes: { ...FILLED.attributes, GTIN: "7891234567895" },
    });
    expect([...edited].toSorted()).toEqual(["attributes.GTIN", "costCents", "imageUrls"]);
  });

  it("ignores spaces around a value and a field typed back to what it was", () => {
    const edited = editedFields(FILLED, {
      ...FILLED,
      title: "Camiseta básica",
      attributes: { BRAND: "Marca", MODEL: "" },
    });
    expect(edited.size).toBe(0);
  });
});

describe("fiscal fields", () => {
  it("saves the NCM as digits and the blanks as empty", () => {
    const values = {
      ...FILLED,
      fiscal: { ...EMPTY_PRODUCT_FISCAL_FORM_VALUES, ncm: "6109.10.00", origin: "0", unit: "UN" },
    };

    const parsed = parseDraft(values);

    expect(parsed).toMatchObject({
      ok: true,
      values: {
        fiscal: { ncm: "61091000", origin: 0, unit: "UN", cest: null, netWeightGrams: null },
      },
    });
  });

  it("names the fiscal field that is wrong, with the reason", () => {
    const values = {
      ...FILLED,
      fiscal: { ...EMPTY_PRODUCT_FISCAL_FORM_VALUES, ncm: "0000.00.00" },
    };

    const parsed = parseDraft(values);

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? {} : parsed.errors).toHaveProperty("fiscal.ncm");
  });

  it("shows a stored NCM with its mask and lists a fiscal edit by its product field", () => {
    const opened = panelFormValues({ ...STORED, fiscal: { ncm: "61091000", netWeightGrams: 300 } });
    const edited = { ...opened, fiscal: { ...opened.fiscal, netWeight: "320" } };

    expect(opened.fiscal.ncm).toBe("6109.10.00");
    expect(editedFields(opened, edited)).toEqual(new Set(["fiscal.netWeightGrams"]));
  });
});

describe("phoneStepLine", () => {
  it("names the step and where it sits among the four", () => {
    expect(phoneStepLine("details", FORM_STEPS)).toBe("Etapa 2 de 4 · Dados obrigatórios");
  });
});
