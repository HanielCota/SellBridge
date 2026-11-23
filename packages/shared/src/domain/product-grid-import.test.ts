import { describe, expect, it } from "vitest";
import type { ProductCsvRow } from "./product-csv.ts";
import {
  planGridImport,
  type ExistingImportModel,
  type ExistingImportSku,
} from "./product-grid-import.ts";

function row(
  line: number,
  sku: string,
  grid: { color: string | null; size: string | null } | null,
  overrides: Partial<ProductCsvRow["product"]> = {},
): ProductCsvRow {
  return {
    line,
    product: {
      sku,
      title: "Tênis Casual",
      description: "",
      costCents: 5990,
      stock: 5,
      categorySlug: null,
      imageUrls: [],
      mercadoLivreAttributes: { BRAND: "Pegada" },
      ...(grid === null ? {} : { grid: { modelCode: "TEN", ...grid } }),
      ...overrides,
    },
  };
}

const none = new Map<string, ExistingImportSku>();
const noModels = new Map<string, ExistingImportModel>();

describe("planGridImport", () => {
  it("turns rows sharing a model code into one grid, sizes in order", () => {
    const plan = planGridImport({
      rows: [
        row(2, "TEN-P-39", { color: "Preto", size: "39" }, { imageUrls: ["https://a/p.jpg"] }),
        row(3, "TEN-P-38", { color: "preto ", size: "38" }),
        row(4, "TEN-B-38", { color: "Branco", size: "38" }),
        row(5, "CANECA", null, { title: "Caneca" }),
      ],
      existingSkus: none,
      existingModels: noModels,
    });

    expect(plan.errors).toEqual([]);
    expect(plan.plainRows.map((entry) => entry.product.sku)).toEqual(["CANECA"]);
    expect(plan.grids).toHaveLength(1);
    expect(plan.grids[0]?.sizes).toEqual(["38", "39"]);
    expect(plan.grids[0]?.colors).toEqual([
      { name: "Preto", imageUrls: ["https://a/p.jpg"] },
      { name: "Branco", imageUrls: [] },
    ]);
    expect(plan.grids[0]?.combinations.map((entry) => [entry.color, entry.size])).toEqual([
      ["Preto", "39"],
      ["Preto", "38"],
      ["Branco", "38"],
    ]);
  });

  it("keeps an old catalog of one product per size as it was, with a notice", () => {
    const existing = new Map<string, ExistingImportSku>([
      ["TEN-P-38", { modelId: null, modelCode: null, color: null, size: null }],
    ]);

    const plan = planGridImport({
      rows: [
        row(2, "TEN-P-38", { color: "Preto", size: "38" }),
        row(3, "TEN-P-39", { color: "Preto", size: "39" }),
      ],
      existingSkus: existing,
      existingModels: noModels,
    });

    expect(plan.grids).toEqual([]);
    expect(plan.plainRows.map((entry) => entry.product.title)).toEqual([
      "Tênis Casual - Preto 38",
      "Tênis Casual - Preto 39",
    ]);
    expect(plan.plainRows.every((entry) => entry.product.grid === undefined)).toBe(true);
    expect(plan.notices[0]?.reason).toBe(
      'As cores e tamanhos de "Tênis Casual" entraram como produtos separados, porque o código TEN-P-38 já existe como produto separado. Juntar produtos que já existem numa grade vai ter uma tela própria',
    );
  });

  it("updates an existing combination like any product and refuses a new colour for it", () => {
    const existing = new Map<string, ExistingImportSku>([
      ["TEN-P-38", { modelId: "m1", modelCode: "TEN", color: "Preto", size: "38" }],
      ["TEN-P-39", { modelId: "m1", modelCode: "TEN", color: "Preto", size: "39" }],
    ]);

    const plan = planGridImport({
      rows: [
        row(2, "TEN-P-38", { color: "Preto", size: "38" }),
        row(3, "TEN-P-39", { color: "Azul", size: "39" }),
      ],
      existingSkus: existing,
      existingModels: noModels,
    });

    expect(plan.plainRows.map((entry) => entry.product.sku)).toEqual(["TEN-P-38"]);
    expect(plan.errors).toEqual([
      expect.objectContaining({
        line: 3,
        reason: expect.stringContaining("já é Preto 39 do modelo TEN"),
      }),
    ]);
  });

  it("names the line whose title differs from the model's first line and creates nothing", () => {
    const plan = planGridImport({
      rows: [
        row(2, "TEN-P-38", { color: "Preto", size: "38" }),
        row(3, "TEN-P-39", { color: "Preto", size: "39" }, { title: "Tênis Esportivo" }),
      ],
      existingSkus: none,
      existingModels: noModels,
    });

    expect(plan.grids).toEqual([]);
    expect(plan.errors).toEqual([
      { line: 3, reason: expect.stringContaining("diferente da linha 2 do modelo TEN") },
    ]);
  });

  it("lets each row carry its own barcode and weight", () => {
    const plan = planGridImport({
      rows: [
        row(
          2,
          "TEN-P-38",
          { color: "Preto", size: "38" },
          {
            mercadoLivreAttributes: { BRAND: "Pegada", GTIN: "7891234567895" },
            fiscal: { ncm: "64039990", netWeightGrams: 700 },
          },
        ),
        row(
          3,
          "TEN-P-39",
          { color: "Preto", size: "39" },
          {
            mercadoLivreAttributes: { BRAND: "Pegada", GTIN: "7891234567888" },
            fiscal: { ncm: "64039990", netWeightGrams: 720 },
          },
        ),
      ],
      existingSkus: none,
      existingModels: noModels,
    });

    expect(plan.errors).toEqual([]);
    expect(plan.grids).toHaveLength(1);
  });

  it("adds new sizes to a grid the supplier has and refuses a pair it already sells", () => {
    const models = new Map<string, ExistingImportModel>([
      [
        "TEN",
        {
          id: "m1",
          code: "TEN",
          colors: ["Preto"],
          sizes: ["38"],
          pairs: new Set(["preto\u000038"]),
        },
      ],
    ]);

    const plan = planGridImport({
      rows: [
        row(2, "TEN-P-40", { color: "Preto", size: "40" }),
        row(3, "TEN-P-38B", { color: "Preto", size: "38" }),
      ],
      existingSkus: none,
      existingModels: models,
    });

    expect(plan.grids).toEqual([]);
    expect(plan.errors).toEqual([
      { line: 3, reason: expect.stringContaining("já tem a combinação Preto 38") },
    ]);
  });

  it("grows a grid the supplier has with its new size only", () => {
    const models = new Map<string, ExistingImportModel>([
      [
        "TEN",
        {
          id: "m1",
          code: "TEN",
          colors: ["Preto"],
          sizes: ["38"],
          pairs: new Set(["preto\u000038"]),
        },
      ],
    ]);

    const plan = planGridImport({
      rows: [row(2, "TEN-P-40", { color: "PRETO", size: "40" })],
      existingSkus: none,
      existingModels: models,
    });

    expect(plan.grids[0]).toMatchObject({ modelId: "m1", colors: [], sizes: ["40"] });
    expect(plan.grids[0]?.combinations[0]).toMatchObject({ color: "Preto", size: "40" });
  });
});

describe("planGridImport errors of a whole grid", () => {
  it("marks every line of a grid past 50 combinations, so importing the valid lines leaves it out", () => {
    const lines = Array.from({ length: 51 }, (_, index) =>
      row(index + 2, `TEN-${index}`, { color: "Preto", size: String(index + 1) }),
    );

    const plan = planGridImport({ rows: lines, existingSkus: none, existingModels: noModels });

    expect(plan.grids).toEqual([]);
    expect(new Set(plan.errors.map((error) => error.line))).toEqual(
      new Set(lines.map((entry) => entry.line)),
    );
  });
});

describe("planGridImport model codes", () => {
  it("treats a code in another case as the same model", () => {
    const plan = planGridImport({
      rows: [
        row(2, "TEN-P-38", { color: "Preto", size: "38" }),
        {
          ...row(3, "TEN-P-39", { color: "Preto", size: "39" }),
          product: {
            ...row(3, "TEN-P-39", { color: "Preto", size: "39" }).product,
            grid: { modelCode: "ten", color: "Preto", size: "39" },
          },
        },
      ],
      existingSkus: none,
      existingModels: noModels,
    });

    expect(plan.errors).toEqual([]);
    expect(plan.grids).toHaveLength(1);
    expect(plan.grids[0]?.combinations).toHaveLength(2);
  });
});
