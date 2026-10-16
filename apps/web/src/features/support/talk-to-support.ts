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
  return { categoria: "listing", anuncio: about.id, assunto: subjectAbout("Anúncio", about.name) };
}
