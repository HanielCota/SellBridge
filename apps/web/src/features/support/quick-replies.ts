import type { TicketCategory } from "@sellbridge/shared/schemas";

/** Short starts for the reseller's reply, picked by what the ticket is about. */
const COMMON = ["Segue o print", "Ainda não resolveu"];

const BY_CATEGORY: Record<TicketCategory, readonly string[]> = {
  order: ["O comprador ainda não recebeu", "Vinculei o pedido ao chamado"],
  payment: ["O valor ainda não apareceu no Financeiro", "Vinculei o pedido ao chamado"],
  store: ["Já tentei reconectar a loja"],
  listing: ["O anúncio continua com erro"],
  account: ["Já saí e entrei de novo na conta"],
  other: [],
};

export function quickRepliesFor(category: TicketCategory): readonly string[] {
  return [...COMMON, ...BY_CATEGORY[category]];
}

/**
 * Adds the snippet to what is already written, as a sentence of its own. Text that would pass
 * `maxLength` stays as it is: the server would refuse it anyway.
 */
export function appendQuickReply(body: string, snippet: string, maxLength: number): string {
  const sentence = `${snippet}.`;
  const trimmed = body.trimEnd();
  const next = trimmed === "" ? `${sentence} ` : `${trimmed} ${sentence} `;
  if (next.length > maxLength) {
    return body;
  }
  return next;
}
