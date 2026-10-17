import { describe, expect, it } from "vitest";
import {
  completenessInput,
  descriptionLengthHint,
  editedFields,
  inputIdOf,
  panelFormValues,
  parseDraft,
  stepOfField,
  type PanelFormValues,
} from "./draft-form";

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
};

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
  it("converts money and units and drops emptied attributes", () => {
    expect(parseDraft(FILLED)).toEqual({
      ok: true,
      values: expect.objectContaining({
        costCents: 2590,
        suggestedPriceCents: 0,
        stock: 8,
        categoryId: null,
        mercadoLivreAttributes: { BRAND: "Marca" },
      }),
    });
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

  it("points a bad image link at the image step", () => {
    const parsed = parseDraft({ ...FILLED, imageUrls: ["ftp://x"] });
    expect(parsed.ok ? [] : Object.keys(parsed.errors)).toEqual(["imageUrls"]);
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
