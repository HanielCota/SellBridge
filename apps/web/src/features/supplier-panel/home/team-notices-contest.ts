import {
  SUPPLIER_FLAG_REASON_LABELS,
  type SupplierFlagReason,
} from "@sellbridge/shared/supplier-flags";
import type { NewTicketSearch } from "@sellbridge/shared/schemas";
import { formatFlagDate } from "@/features/admin-suppliers/supplier-flag-copy";

/**
 * A flag has no support topic of its own yet: the supplier's "Outra coisa" asks them to tell it
 * in their own words, which is what contesting is. The subject names the flag for the team.
 */
const CONTEST_CATEGORY = "other";

/**
 * The "Contestar esta flag" link of one notice: the ticket opens with the flag named in the
 * subject and the text already started, so the team knows which flag without asking back.
 */
export function contestTicketSearch(notice: {
  reason: SupplierFlagReason;
  createdAt: Date;
}): NewTicketSearch {
  const label = SUPPLIER_FLAG_REASON_LABELS[notice.reason];
  return {
    categoria: CONTEST_CATEGORY,
    assunto: `Contestar flag: ${label}`,
    texto: `Quero contestar a flag "${label}" de ${formatFlagDate(notice.createdAt)}. Motivo: `,
  };
}

/** The "Pedir revisão ao suporte" link of a switched-off supplier. */
export function offAccountReviewSearch(): NewTicketSearch {
  return {
    categoria: CONTEST_CATEGORY,
    assunto: "Revisão da conta desligada",
    texto: "Minha conta de fornecedor foi desligada e quero pedir uma revisão. Motivo: ",
  };
}
