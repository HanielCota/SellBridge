import { forbiddenError } from "@sellbridge/shared/errors";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "./auth.ts";

/**
 * Refuses what outlives an admin's "sign in as the customer" session and would be recorded as
 * done by the customer: an API key or a webhook created then keeps working (and sending data
 * out) after the impersonation ends.
 */
export async function assertNotImpersonating(action: string): Promise<void> {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (session?.session.impersonatedBy) {
    throw forbiddenError(`Não é possível ${action} durante o acesso como cliente`);
  }
}
