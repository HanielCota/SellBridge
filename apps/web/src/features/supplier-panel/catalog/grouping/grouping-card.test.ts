import type { GroupingSuggestionView } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import {
  checkedProducts,
  draftProblems,
  groupingConsequence,
  groupingInput,
  initialDraft,
} from "./grouping-card";

const fiscal = { ncm: "64039990", origin: 0, unit: "PAR" };

function suggestionProduct(id: string, color: string | null, size: string | null) {
  return {
    id,
    sku: `SKU-${id}`,
    title: `Tênis - ${color ?? ""} ${size ?? ""}`,
    imageUrl: null,
    stock: 3,
    reservedStock: 0,
    active: true,
    approved: true,
    liveListings: 1,
    categoryId: "shoes",
    fiscal,
    color,
    size,
  };
}

const suggestion: GroupingSuggestionView = {
  key: "a,b,c",
  modelTitle: "Tênis",
  mainProductId: "a",
  products: [
    suggestionProduct("a", "Preto", "38"),
    suggestionProduct("b", "Preto", "39"),
    suggestionProduct("c", null, null),
  ],
};

describe("grouping card", () => {
  it("asks for colour and size on a product whose name could not be read", () => {
    const problems = draftProblems(suggestion, initialDraft(suggestion));

    expect(problems.byProduct.c).toEqual(["Informe a cor, o tamanho ou os dois"]);
  });

  it("drops an unchecked product from the group and from what is sent", () => {
    const draft = initialDraft(suggestion);
    const unchecked = {
      ...draft,
      products: { ...draft.products, ["c"]: { checked: false, color: "", size: "" } },
    };

    expect(draftProblems(suggestion, unchecked).byProduct).toEqual({});
    expect(groupingInput("supplier", suggestion, unchecked).products).toEqual([
      { productId: "a", color: "Preto", size: "38" },
      { productId: "b", color: "Preto", size: "39" },
    ]);
  });

  it("trims what was typed and sends empty cells as no colour or size", () => {
    const draft = initialDraft(suggestion);
    const typed = {
      ...draft,
      products: { ...draft.products, ["c"]: { checked: true, color: " Branco ", size: " " } },
    };

    expect(checkedProducts(suggestion, typed)[2]).toMatchObject({ color: "Branco", size: null });
  });
});

describe("groupingConsequence", () => {
  it("counts the products and the listings on the air", () => {
    expect(
      groupingConsequence([{ liveListings: 2 }, { liveListings: 3 }, { liveListings: 0 }]),
    ).toEqual([
      "Os 3 produtos viram 1 na sua lista.",
      "Os 5 anúncios que os revendedores já têm no ar continuam iguais e vendendo.",
      "Código, estoque e preço de cada um não mudam.",
      "O nome de cada um vira o do produto com a cor e o tamanho, e as fotos de cada cor juntam as fotos dos produtos dessa cor.",
      "Descrição, ficha, produto sob encomenda e somente transportadora passam a ser os do produto principal.",
      "Você pode separar de novo depois.",
    ]);
  });

  it("says so when no product has a listing on the air", () => {
    expect(groupingConsequence([{ liveListings: 0 }, { liveListings: 0 }])[1]).toBe(
      "Nenhum deles tem anúncio no ar agora.",
    );
  });

  it("speaks of one listing in the singular", () => {
    expect(groupingConsequence([{ liveListings: 1 }, { liveListings: 0 }])[1]).toBe(
      "O anúncio que os revendedores já têm no ar continua igual e vendendo.",
    );
  });
});
