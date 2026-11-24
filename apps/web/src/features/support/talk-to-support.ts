import type { NewTicketSearch } from "@sellbridge/shared/schemas";

/** The new-ticket form fits a subject of up to 120 characters. */
const SUBJECT_MAX = 120;

function subjectAbout(prefix: string, name: string): string {
  const subject = `${prefix} ${name}`;
  return subject.length <= SUBJECT_MAX ? subject : `${subject.slice(0, SUBJECT_MAX - 1)}…`;
}

/**
 * Search params that open "Novo chamado" already about an order, store or listing: the right
 * subject, a first line for the title, and the id the server checks and links (item 27.a).
 */
export function supportTicketSearch(
  about:
    | { kind: "order"; id: string; name: string }
    | { kind: "store"; id: string; name: string }
    | { kind: "listing"; id: string; name: string },
): NewTicketSearch {
  if (about.kind === "order") {
    return { categoria: "order", pedido: about.id, assunto: subjectAbout("Pedido", about.name) };
  }
  if (about.kind === "store") {
    return { categoria: "store", loja: about.id, assunto: subjectAbout("Loja", about.name) };
  }
  return {
    categoria: "listing",
    anuncio: about.id,
    assunto: subjectAbout("Publicação", about.name),
  };
}

/**
 * Opens "Novo chamado" asking the team to give back by hand what the reseller paid a supplier
 * for this order: topic, situation, order and a first line are filled in, so one tap sends it.
 */
export function supplierRefundTicketSearch(order: {
  id: string;
  name: string;
  amount: string;
}): NewTicketSearch {
  return {
    categoria: "payment",
    situacao: "supplier-refund",
    pedido: order.id,
    assunto: subjectAbout("Pedido", order.name),
    texto: `Quero de volta os ${order.amount} que paguei ao fornecedor no pedido ${order.name}.`,
  };
}
