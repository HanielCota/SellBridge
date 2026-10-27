import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { TICKET_CATEGORY_LABELS, type TicketCategory } from "@sellbridge/shared/schemas";
import { findSupportTopic } from "@sellbridge/shared/support-topics";
import { REPLY_TEMPLATES, type ReplyTemplate } from "@/features/support/reply-templates";

/**
 * Who opened the ticket, as the support team calls them: "Revendedor", like the account chip.
 * The admin profile screens' `PROFILE_KIND_LABELS` say "Vendedor" for the same kind.
 */
export const REQUESTER_KIND_LABELS: Record<ProfileKind, string> = {
  seller: "Revendedor",
  supplier: "Fornecedor",
};

/**
 * The topic as the account that opened the ticket saw it: a supplier picks "Pedido encaminhado",
 * and the team read the reseller's "Pedido ou entrega" for the same category.
 */
export function ticketTopicLabel(category: TicketCategory, kind: ProfileKind): string {
  return findSupportTopic(kind, category)?.label ?? TICKET_CATEGORY_LABELS[category];
}

/** The ready answers that make sense on a ticket of this kind of account. */
export function replyTemplatesFor(kind: ProfileKind): readonly ReplyTemplate[] {
  return REPLY_TEMPLATES.filter(
    (template) => template.onlyFor === undefined || template.onlyFor === kind,
  );
}

/**
 * Linking an order searches the orders of the account's connected stores. A supplier has none,
 * so the picker only ever opened empty.
 */
export function canLinkOrders(kind: ProfileKind): boolean {
  return kind === "seller";
}
