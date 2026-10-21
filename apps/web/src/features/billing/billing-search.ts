import { optionalParameter } from "@sellbridge/shared/schemas";
import { z } from "zod";

/** Where Stripe Checkout sends the customer back; anything else in the URL is ignored. */
export const subscriptionSearchSchema = z.object({
  retorno: optionalParameter(z.enum(["sucesso", "cancelado"])),
});
