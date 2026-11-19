import { describe, expect, it } from "vitest";
import {
  EMPTY_GRID_FORM_STATE,
  gridFormStateOf,
  suggestedSku,
  withColorAdded,
  withColorRemoved,
  withCombinationChanged,
  withCombinationsFilled,
  withCombinationToggled,
  withSizesAdded,
  type GridFormState,
} from "./grid-form-state";

function pairs(state: GridFormState): string[] {
  const color = new Map(state.colors.map((entry) => [entry.key, entry.name]));
  const size = new Map(state.sizes.map((entry) => [entry.key, entry.name]));
  return state.combinations.map((combination) =>
    [
      combination.colorKey === null ? "" : color.get(combination.colorKey),
      combination.sizeKey === null ? "" : size.get(combination.sizeKey),
    ].join("/"),
  );
}

const twoByTwo = withSizesAdded(
  withColorAdded(withColorAdded(EMPTY_GRID_FORM_STATE, "Preto", "c1"), "Branco", "c2"),
  [
    { name: "39", key: "s2" },
    { name: "38", key: "s1" },
  ],
);

describe("grid form state", () => {
  it("sells every colour in every size as options are added", () => {
    expect(pairs(twoByTwo).toSorted()).toEqual(["Branco/38", "Branco/39", "Preto/38", "Preto/39"]);
  });

  it("keeps sizes in their natural order whatever order they were typed in", () => {
    expect(twoByTwo.sizes.map((size) => size.name)).toEqual(["38", "39"]);
  });

  it("keeps what was typed when the first size arrives on a grid of colours", () => {
    const colours = withCombinationChanged(
      withColorAdded(EMPTY_GRID_FORM_STATE, "Preto", "c1"),
      { colorKey: "c1", sizeKey: null },
      { stock: "7" },
    );

    const withSize = withSizesAdded(colours, [{ name: "38", key: "s1" }]);

    expect(withSize.combinations).toMatchObject([{ colorKey: "c1", sizeKey: "s1", stock: "7" }]);
  });

  it("ignores a colour already in the grid, whatever its case or accents", () => {
    const state = withColorAdded(twoByTwo, " preto", "c3");

    expect(state).toBe(twoByTwo);
  });

  it("leaves one combination per size when the last colour goes", () => {
    const sizesOnly = withColorRemoved(withColorRemoved(twoByTwo, "c1"), "c2");

    expect(pairs(sizesOnly)).toEqual(["/38", "/39"]);
  });

  it("drops a pair the supplier does not sell and brings it back blank", () => {
    const without = withCombinationToggled(twoByTwo, { colorKey: "c2", sizeKey: "s2" }, false);
    const back = withCombinationToggled(without, { colorKey: "c2", sizeKey: "s2" }, true);

    expect(pairs(without)).not.toContain("Branco/39");
    expect(pairs(back)).toContain("Branco/39");
  });

  it("fills cost, price and stock everywhere but never replaces a typed SKU", () => {
    const typed = withCombinationChanged(
      twoByTwo,
      { colorKey: "c1", sizeKey: "s1" },
      { sku: "MEU-SKU" },
    );

    const filled = withCombinationsFilled(typed, {
      skuBase: "TEN",
      cost: "50,00",
      suggestedPrice: "",
      stock: "3",
    });

    expect(filled.combinations.map((entry) => entry.sku).toSorted()).toEqual([
      "MEU-SKU",
      "TEN-BRANCO-38",
      "TEN-BRANCO-39",
      "TEN-PRETO-39",
    ]);
    expect(filled.combinations.every((entry) => entry.cost === "50,00")).toBe(true);
    expect(filled.combinations.every((entry) => entry.suggestedPrice === "")).toBe(true);
  });

  it("opens a stored grid with only the combinations still on sale", () => {
    const state = gridFormStateOf({
      colors: [{ name: "Preto", imageUrls: [] }],
      sizes: ["38", "39"],
      combinations: [
        {
          color: "Preto",
          size: "38",
          sku: "P-38",
          gtin: null,
          costCents: 5000,
          suggestedPriceCents: 9990,
          stock: 4,
          active: true,
        },
        {
          color: "Preto",
          size: "39",
          sku: "P-39",
          gtin: null,
          costCents: 5000,
          suggestedPriceCents: 9990,
          stock: 0,
          active: false,
        },
      ],
    });

    expect(state.combinations).toMatchObject([
      { sku: "P-38", cost: "50,00", stock: "4", savedStock: 4 },
    ]);
  });
});

describe("suggestedSku", () => {
  it("joins the code with colour and size without accents or spaces", () => {
    expect(suggestedSku("TEN-CASUAL", "Azul Marinho", "37/38")).toBe("TEN-CASUAL-AZULMARINHO-3738");
  });
});
