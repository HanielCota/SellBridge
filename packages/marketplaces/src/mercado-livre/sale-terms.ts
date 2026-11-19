import type { ListingSaleTerms } from "@sellbridge/shared/product-sale-terms";

/**
 * Warranty and made-to-order time as Mercado Livre's `sale_terms`, in the names its Brazilian
 * site uses ("Publicar produtos" page: WARRANTY_TYPE with "Garantia do vendedor" / "Garantia de
 * fábrica" / "Sem garantia", WARRANTY_TIME in "dias"; "Sincronização" page: MANUFACTURING_TIME in
 * days, read on 2026-11-16).
 */
const WARRANTY_NAMES = {
  none: "Sem garantia",
  seller: "Garantia do vendedor",
  factory: "Garantia de fábrica",
} as const;

export interface SaleTerm {
  readonly id: string;
  readonly value_name: string;
}

function warrantyTerms(terms: ListingSaleTerms): SaleTerm[] {
  if (terms.warrantyType === null) {
    return [];
  }
  const type = { id: "WARRANTY_TYPE", value_name: WARRANTY_NAMES[terms.warrantyType] };
  if (terms.warrantyType === "none" || terms.warrantyDays === null) {
    return [type];
  }
  return [type, { id: "WARRANTY_TIME", value_name: `${terms.warrantyDays} dias` }];
}

/** The terms to send; empty when the supplier said nothing, so Mercado Livre keeps its default. */
export function saleTermsFor(terms: ListingSaleTerms | undefined): SaleTerm[] {
  if (terms === undefined) {
    return [];
  }
  const madeToOrder =
    terms.madeToOrderDays === null
      ? []
      : [{ id: "MANUFACTURING_TIME", value_name: `${terms.madeToOrderDays} dias` }];
  return [...warrantyTerms(terms), ...madeToOrder];
}
