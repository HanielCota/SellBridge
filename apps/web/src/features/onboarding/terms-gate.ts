/**
 * Whether the signed-in person must accept the terms in force before using the app (item 26.a,
 * L4). An admin visiting a customer is never asked: accepting is the customer's own act.
 */
export function needsTermsAcceptance(session: {
  termsAccepted: boolean;
  impersonatedBy: string | null;
}): boolean {
  return !session.termsAccepted && session.impersonatedBy === null;
}
