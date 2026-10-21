import type { ProfileKind } from "@sellbridge/shared/profile-kind";

/** What a ticket can be about, in each profile's words: a supplier has products, not stores. */
const TICKET_TOPICS: Record<ProfileKind, string> = {
  seller: "pedidos, lojas ou repasses",
  supplier: "pedidos, produtos ou repasses",
};

/** The empty Suporte page, before the first ticket. */
export function noTicketsDescription(profileKind: ProfileKind): string {
  return `Abra um chamado sobre ${TICKET_TOPICS[profileKind]}. A resposta aparece aqui.`;
}

/**
 * The promise under the send button. Business days, never hours: the team's target is counted in
 * calendar hours for now, and a promise in hours made at night would be broken by morning.
 */
export function responsePromise(priority: "normal" | "high"): string {
  const when = "Respondemos em até 1 dia útil. A resposta chega por e-mail e no sino.";
  if (priority === "high") {
    return `Casos como o seu são respondidos primeiro. ${when}`;
  }
  return when;
}
