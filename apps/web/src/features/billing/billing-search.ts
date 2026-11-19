import { optionalParameter } from "@sellbridge/shared/schemas";
import { z } from "zod";

/**
 * Where Asaas sends the customer back: from the payment (sucesso, cancelado) or from the upgrade
 * difference (troca). Anything else in the URL is ignored.
 */
export const subscriptionSearchSchema = z.object({
  retorno: optionalParameter(z.enum(["sucesso", "cancelado", "troca"])),
  /** "Só cancelar o plano" from the account deletion: opens the cancellation on arrival. */
  cancelar: optionalParameter(z.literal("1")),
});
