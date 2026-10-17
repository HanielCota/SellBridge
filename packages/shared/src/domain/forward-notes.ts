/**
 * Notes the forward leaves in a parcel's history, shared by who writes them (the database
 * repository) and who reads them back (the supplier panel's queue), so a change of wording
 * never breaks the detection.
 */

/** What the reseller reads in the parcel's history when its supplier e-mail did not go out. */
export const SUPPLIER_EMAIL_FAILED_NOTE =
  "O e-mail ao fornecedor não foi enviado. Gere um novo link e envie a ele.";

/** True for the note `noteSupplierEmailFailed` writes, and only for it. */
export function isForwardEmailFailureNote(note: string): boolean {
  return note.trim() === SUPPLIER_EMAIL_FAILED_NOTE;
}
