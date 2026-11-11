/** Where a stopped NF-e is fixed: the screen the problem itself tells the supplier to open. */
export interface InvoiceFixLink {
  readonly label: string;
  /** Path under the supplier panel, with its search when the screen has a filter for it. */
  readonly path: string;
}

const PRODUCTS_LINK: InvoiceFixLink = {
  label: "Abrir produtos sem dados fiscais",
  path: "/produtos?fiscal=missing",
};
const BLING_LINK: InvoiceFixLink = { label: "Abrir o Bling", path: "/importar" };
const BRAND_LINK: InvoiceFixLink = { label: "Abrir Marca", path: "/marca" };

/**
 * The worker's problem names the screen ("Preencha em Produtos", "Conecte o Bling de novo"); the
 * link follows it, so the button never points somewhere the text did not say. Tax codes and the
 * company data, the rest of what stops a note, live in Marca.
 */
export function invoiceFixLink(problem: string | null): InvoiceFixLink {
  if (problem === null) {
    return BRAND_LINK;
  }
  if (problem.includes("Preencha em Produtos")) {
    return PRODUCTS_LINK;
  }
  if (
    problem.includes("Conecte o Bling de novo") ||
    problem.includes("nota pelo Bling foi desligada")
  ) {
    return BLING_LINK;
  }
  return BRAND_LINK;
}
