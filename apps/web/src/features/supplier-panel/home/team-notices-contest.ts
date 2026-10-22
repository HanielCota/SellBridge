import {
  SUPPLIER_FLAG_REASON_LABELS,
  type SupplierFlagReason,
} from "@sellbridge/shared/supplier-flags";
import type { NewTicketSearch } from "@sellbridge/shared/schemas";

/**
 * A flag has no support topic of its own yet: the supplier's "Outra coisa" asks them to tell it
 * in their own words, which is what contesting is. The subject names the flag for the team.
 */
const CONTEST_CATEGORY = "other";

/** The new-ticket link of "Discorda? Fale com o suporte". */
export function contestTicketSearch(reasons: readonly SupplierFlagReason[]): NewTicketSearch {
  const [only] = reasons;
  if (reasons.length !== 1 || only === undefined) {
    return { categoria: CONTEST_CATEGORY, assunto: "Discordo de um aviso da equipe" };
  }
  return {
    categoria: CONTEST_CATEGORY,
    assunto: `Discordo do aviso: ${SUPPLIER_FLAG_REASON_LABELS[only]}`,
  };
}
