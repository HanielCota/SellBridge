import { describe, expect, it } from "vitest";
import { panelFormValues } from "../draft-form";
import { combinationField, gridCompleteness, parseModelDraft } from "./grid-form-draft";
import {
  EMPTY_GRID_FORM_STATE,
  withColorAdded,
  withColorRenamed,
  withCombinationChanged,
  withSizesAdded,
  type GridFormState,
} from "./grid-form-state";

const values = {
  ...panelFormValues(null),
  title: "Tênis Casual Couro",
  description: "Couro legítimo, solado de borracha e palmilha macia para o dia todo.",
  attributes: { BRAND: "Pegada", GTIN: "7891234567895" },
};

const black38 = { colorKey: "c1", sizeKey: "s1" };

function grid(): GridFormState {
  const state = withSizesAdded(withColorAdded(EMPTY_GRID_FORM_STATE, "Preto", "c1"), [
    { name: "38", key: "s1" },
  ]);
  return withCombinationChanged(state, black38, {
    sku: "TEN-P-38",
    cost: "50,00",
    stock: "4",
  });
}

describe("parseModelDraft", () => {
  it("sends the model without a barcode and each combination with its own values", () => {
    const parsed = parseModelDraft(values, grid());

    expect(parsed).toMatchObject({
      ok: true,
      values: { title: "Tênis Casual Couro", mercadoLivreAttributes: { BRAND: "Pegada" } },
      grid: {
        colors: [{ name: "Preto" }],
        sizes: [{ name: "38" }],
        combinations: [{ color: "Preto", size: "38", sku: "TEN-P-38", costCents: 5000, stock: 4 }],
      },
    });
  });

  it("fills the suggested price from the cost when it was left blank", () => {
    const parsed = parseModelDraft(values, grid());

    expect(parsed.ok && parsed.grid.combinations[0]?.suggestedPriceCents).toBeGreaterThan(5000);
  });

  it("keeps a new combination without a SKU on screen instead of sending it", () => {
    const state = withCombinationChanged(grid(), black38, { sku: "" });

    const parsed = parseModelDraft(values, state);

    expect(parsed.ok && parsed.grid.combinations).toEqual([]);
  });

  it("waits, naming the field, while an amount is half typed", () => {
    const state = withCombinationChanged(grid(), black38, { cost: "50,0,0" });

    const parsed = parseModelDraft(values, state);

    expect(parsed).toEqual({
      ok: false,
      errors: { [combinationField(black38, "cost")]: "Valor inválido, revise o campo." },
    });
  });

  it("sends a renamed colour as a rename of the saved one", () => {
    const saved: GridFormState = {
      ...grid(),
      colors: grid().colors.map((color) => ({ ...color, savedName: "Preto" })),
    };

    const parsed = parseModelDraft(values, withColorRenamed(saved, "c1", "Grafite"));

    expect(parsed.ok && parsed.grid.colors).toEqual([
      { name: "Grafite", previousName: "Preto", imageUrls: [] },
    ]);
  });

  it("refuses two combinations with the same SKU under the second one", () => {
    const twoSizes = withSizesAdded(grid(), [{ name: "39", key: "s2" }]);
    const state = withCombinationChanged(
      twoSizes,
      { colorKey: "c1", sizeKey: "s2" },
      { sku: "TEN-P-38" },
    );

    const parsed = parseModelDraft(values, state);

    expect(parsed).toMatchObject({
      ok: false,
      errors: { grid: "O código TEN-P-38 aparece em mais de uma combinação" },
    });
  });
});

describe("gridCompleteness", () => {
  it("asks for the SKU of every combination on the grid step", () => {
    const twoSizes = withSizesAdded(grid(), [{ name: "39", key: "s2" }]);

    const report = gridCompleteness(values, twoSizes, { required: [], fallback: null });

    expect(report.blocking).toContainEqual(
      expect.objectContaining({ field: "grid", message: "Preencha o código de cada combinação" }),
    );
  });

  it("names a colour nobody sells", () => {
    const state = withColorAdded(grid(), "Branco", "c2");
    const withoutWhite = {
      ...state,
      combinations: state.combinations.filter((entry) => entry.colorKey !== "c2"),
    };

    const report = gridCompleteness(values, withoutWhite, { required: [], fallback: null });

    expect(report.blocking.map((issue) => issue.message)).toContain(
      'A cor "Branco" não tem nenhuma combinação',
    );
  });
});

describe("barcode on a grid", () => {
  it("asks the barcode of each combination, on the colours and sizes step", () => {
    const withoutBarcode = { ...values, attributes: { BRAND: "Pegada" } };

    const report = gridCompleteness(withoutBarcode, grid(), { required: [], fallback: null });

    const barcode = [...report.blocking, ...report.improvements].filter((issue) =>
      issue.message.includes("código de barras"),
    );
    expect(barcode).toEqual([
      expect.objectContaining({
        field: "grid",
        message: "Informe o código de barras (GTIN) de cada combinação",
      }),
    ]);
  });
});
