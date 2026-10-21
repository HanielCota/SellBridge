import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { TICKET_CATEGORY_LABELS, type TicketCategory } from "@sellbridge/shared/schemas";
import { findSupportTopic } from "@sellbridge/shared/support-topics";
import { REPLY_TEMPLATES, type ReplyTemplate } from "@/features/support/reply-templates";

/** Who opened the ticket, in the words the team uses for each kind of account. */
export const PROFILE_KIND_LABELS: Record<ProfileKind, string> = {
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

/** Ready answers that make sense for the account: a supplier is never "forwarded to the supplier". */
const RESELLER_ONLY_TEMPLATES: ReadonlySet<string> = new Set(["supplier"]);

export function replyTemplatesFor(kind: ProfileKind): readonly ReplyTemplate[] {
  if (kind === "seller") {
    return REPLY_TEMPLATES;
  }
  return REPLY_TEMPLATES.filter((template) => !RESELLER_ONLY_TEMPLATES.has(template.id));
}

/**
 * Linking an order searches the orders of the account's connected stores. A supplier has none,
 * so the picker only ever opened empty.
 */
export function canLinkOrders(kind: ProfileKind): boolean {
  return kind === "seller";
}
