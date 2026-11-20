import type { GroupingSuggestionView } from "@sellbridge/database/repositories";
import {
  groupingProblems,
  type GroupingProblems,
  type GroupingProduct,
  type GroupProductsInput,
} from "@sellbridge/shared/product-grouping";

/** What the supplier changes on one suggestion before confirming it. */
export interface GroupingDraft {
  readonly modelTitle: string;
  readonly mainProductId: string;
  readonly products: Readonly<Record<string, DraftProduct>>;
}

export interface DraftProduct {
  readonly checked: boolean;
  readonly color: string;
  readonly size: string;
}

export function initialDraft(suggestion: GroupingSuggestionView): GroupingDraft {
  return {
    modelTitle: suggestion.modelTitle,
    mainProductId: suggestion.mainProductId,
    products: Object.fromEntries(
      suggestion.products.map((product) => [
        product.id,
        { checked: true, color: product.color ?? "", size: product.size ?? "" },
      ]),
    ),
  };
}

function optionOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The suggestion's products the supplier left checked, with what they typed. */
export function checkedProducts(
  suggestion: GroupingSuggestionView,
  draft: GroupingDraft,
): (GroupingSuggestionView["products"][number] & { color: string | null; size: string | null })[] {
  return suggestion.products.flatMap((product) => {
    const typed = draft.products[product.id];
    if (typed === undefined || !typed.checked) {
      return [];
    }
    return [{ ...product, color: optionOrNull(typed.color), size: optionOrNull(typed.size) }];
  });
}

/** The checks of the confirmation, run as the supplier types, so the button says why it waits. */
export function draftProblems(
  suggestion: GroupingSuggestionView,
  draft: GroupingDraft,
): GroupingProblems {
  const products: GroupingProduct[] = checkedProducts(suggestion, draft).map((product) => ({
    productId: product.id,
    sku: product.sku,
    color: product.color,
    size: product.size,
    categoryId: product.categoryId,
    fiscal: product.fiscal,
  }));
  return groupingProblems({
    modelTitle: draft.modelTitle,
    mainProductId: draft.mainProductId,
    products,
  });
}

export function groupingInput(
  supplierId: string,
  suggestion: GroupingSuggestionView,
  draft: GroupingDraft,
): GroupProductsInput {
  return {
    supplierId,
    modelTitle: draft.modelTitle.trim(),
    mainProductId: draft.mainProductId,
    products: checkedProducts(suggestion, draft).map((product) => ({
      productId: product.id,
      color: product.color,
      size: product.size,
    })),
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * What confirming does, with the real numbers: "Os 8 produtos viram 1 na sua lista. Os 5 anúncios
 * no ar continuam iguais e vendendo…".
 */
export function groupingConsequence(
  products: readonly { liveListings: number }[],
): readonly string[] {
  const live = products.reduce((sum, product) => sum + product.liveListings, 0);
  return [
    `Os ${plural(products.length, "produto", "produtos")} viram 1 na sua lista.`,
    live === 0
      ? "Nenhum deles tem anúncio no ar agora."
      : `${live === 1 ? "O anúncio" : `Os ${live} anúncios`} que os revendedores já têm no ar ${live === 1 ? "continua igual e vendendo" : "continuam iguais e vendendo"}.`,
    "Código, estoque e preço de cada um não mudam.",
    "Nome, fotos e ficha passam a ser os do produto principal.",
    "Você pode separar de novo depois.",
  ];
}
