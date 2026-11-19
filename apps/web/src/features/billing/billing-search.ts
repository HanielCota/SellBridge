import { optionalParameter } from "@sellbridge/shared/schemas";
import { z } from "zod";

/**
 * Where Stripe sends the customer back: from the checkout (sucesso, cancelado) or from a plan
 * change confirmed in the portal (troca). Anything else in the URL is ignored.
 */
export const subscriptionSearchSchema = z.object({
  retorno: optionalParameter(z.enum(["sucesso", "cancelado", "troca"])),
});
