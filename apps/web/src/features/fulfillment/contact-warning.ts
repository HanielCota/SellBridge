import { CONTACT_DETAILS_REFUSED, findContactDetails } from "@sellbridge/shared/schemas";

/**
 * The warning under a free-text field between reseller and supplier, shown while typing: the
 * server refuses the same text, but the person should learn why before pressing the button.
 */
export function contactWarning(text: string): string | null {
  return findContactDetails(text).length > 0 ? CONTACT_DETAILS_REFUSED : null;
}
