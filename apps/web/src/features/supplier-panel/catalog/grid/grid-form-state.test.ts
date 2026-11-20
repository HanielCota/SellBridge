import { describe, expect, it } from "vitest";
import {
  EMPTY_GRID_FORM_STATE,
  gridFillProblems,
  gridFormStateOf,
  suggestedSku,
  withColorAdded,
  withColorRemoved,
  withCombinationChanged,
  withCombinationsFilled,
  withCombinationToggled,
  withOptionRestored,
  withSaveAnswer,
  withSizeRemoved,
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

  it("ignores a colour that differs only in the spaces between words", () => {
    const navy = withColorAdded(EMPTY_GRID_FORM_STATE, "Azul Marinho", "c1");

    expect(withColorAdded(navy, "Azul  Marinho", "c2")).toBe(navy);
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

function isBlack38(entry: { colorKey: string | null; sizeKey: string | null }): boolean {
  return entry.colorKey === "c1" && entry.sizeKey === "s1";
}

describe("withSaveAnswer", () => {
  it("learns the stored names and stock without undoing what was typed meanwhile", () => {
    const black38 = { colorKey: "c1", sizeKey: "s1" };
    const sent = withCombinationChanged(twoByTwo, black38, { sku: "P-38", stock: "4" });
    const typedMeanwhile = withCombinationChanged(sent, black38, { cost: "50" });

    const answered = withSaveAnswer(
      typedMeanwhile,
      { grid: sent, combinations: sent.combinations.filter(isBlack38) },
      [{ color: "Preto", size: "38", stock: 3 }],
    );

    expect(answered.colors.map((color) => color.savedName)).toEqual(["Preto", "Branco"]);
    expect(answered.combinations.find(isBlack38)).toMatchObject({
      cost: "50",
      stock: "3",
      savedStock: 3,
    });
  });
});

describe("undoing a removed colour or size", () => {
  const typedBranco = withCombinationChanged(
    twoByTwo,
    { colorKey: "c2", sizeKey: "s1" },
    { sku: "TEN-B-38" },
  );
  const removedBranco = { axis: "color" as const, key: "c2", before: typedBranco };

  it("puts back only the removed colour and keeps what was typed since", () => {
    const edited = withCombinationChanged(
      withColorRemoved(typedBranco, "c2"),
      { colorKey: "c1", sizeKey: "s1" },
      { sku: "TEN-P-38" },
    );

    const restored = withOptionRestored(edited, removedBranco);

    expect(restored.colors.map((color) => color.name)).toEqual(["Preto", "Branco"]);
    expect(pairs(restored).toSorted()).toEqual(["Branco/38", "Branco/39", "Preto/38", "Preto/39"]);
    expect(
      restored.combinations.find((entry) => entry.colorKey === "c1" && entry.sizeKey === "s1")?.sku,
    ).toBe("TEN-P-38");
    expect(
      restored.combinations.find((entry) => entry.colorKey === "c2" && entry.sizeKey === "s1")?.sku,
    ).toBe("TEN-B-38");
  });

  it("leaves out a combination whose size was removed meanwhile", () => {
    const edited = withSizeRemoved(withColorRemoved(typedBranco, "c2"), "s2");

    const restored = withOptionRestored(edited, removedBranco);

    expect(pairs(restored).toSorted()).toEqual(["Branco/38", "Preto/38"]);
  });

  it("brings the last colour back in place of the size-only stand-ins", () => {
    const onlyBranco = withColorRemoved(typedBranco, "c1");
    const before = withCombinationChanged(
      onlyBranco,
      { colorKey: "c2", sizeKey: "s1" },
      { sku: "TEN-B-38" },
    );
    const edited = withColorRemoved(before, "c2");

    const restored = withOptionRestored(edited, { axis: "color", key: "c2", before });

    expect(pairs(restored).toSorted()).toEqual(["Branco/38", "Branco/39"]);
  });

  it("pairs a colour back with the sizes added after it was removed", () => {
    const colours = withCombinationChanged(
      withColorAdded(withColorAdded(EMPTY_GRID_FORM_STATE, "Preto", "c1"), "Branco", "c2"),
      { colorKey: "c1", sizeKey: null },
      { sku: "TEN-P" },
    );
    const edited = withSizesAdded(withColorRemoved(colours, "c1"), [{ name: "38", key: "s1" }]);

    const restored = withOptionRestored(edited, { axis: "color", key: "c1", before: colours });

    expect(pairs(restored).toSorted()).toEqual(["Branco/38", "Preto/38"]);
    expect(
      restored.combinations.find((entry) => entry.colorKey === "c1" && entry.sizeKey === "s1")?.sku,
    ).toBe("TEN-P");
  });

  it("sells a restored colour in a size added since, and keeps off a pair it was not sold in", () => {
    const before = withCombinationToggled(typedBranco, { colorKey: "c2", sizeKey: "s2" }, false);
    const edited = withSizesAdded(withColorRemoved(before, "c2"), [{ name: "40", key: "s3" }]);

    const restored = withOptionRestored(edited, { axis: "color", key: "c2", before });

    expect(
      pairs(restored)
        .filter((pair) => pair.startsWith("Branco"))
        .toSorted(),
    ).toEqual(["Branco/38", "Branco/40"]);
  });

  it("brings nothing back when a colour of the same name was added meanwhile", () => {
    const edited = withColorAdded(withColorRemoved(typedBranco, "c2"), "branco", "c3");

    const restored = withOptionRestored(edited, removedBranco);

    expect(restored).toBe(edited);
  });
});

describe("Preencher todas", () => {
  it("never gives two combinations the same code when colour names read the same", () => {
    const greens = withColorAdded(
      withColorAdded(EMPTY_GRID_FORM_STATE, "Verde-Água", "g1"),
      "Verde Agua",
      "g2",
    );

    const filled = withCombinationsFilled(greens, {
      skuBase: "TEN",
      cost: "",
      suggestedPrice: "",
      stock: "",
    });

    expect(filled.combinations.map((combination) => combination.sku)).toEqual([
      "TEN-VERDEAGUA",
      "TEN-VERDEAGUA-2",
    ]);
  });

  it("refuses a value typed halfway, saying how to write it", () => {
    const problems = gridFillProblems({
      skuBase: "TEN",
      cost: "59,",
      suggestedPrice: "119,90",
      stock: "1,5",
    });

    expect(problems).toEqual({
      cost: '"59," não é um valor em reais. Exemplo: 59,90',
      stock: '"1,5" não é uma quantidade. Use um número inteiro, por exemplo 10',
    });
  });

  it("finds nothing to refuse in blank or well-typed values", () => {
    expect(
      gridFillProblems({ skuBase: "", cost: "59,90", suggestedPrice: "", stock: "10" }),
    ).toEqual({});
  });
});
