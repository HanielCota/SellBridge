import { nameSchema } from "@sellbridge/shared/schemas";
import { TERMS_VERSION } from "@sellbridge/shared/terms";
import { z } from "zod";

/**
 * What /sign-up/email must carry besides the e-mail and password: the same name rules as the
 * profile, and the terms box ticked on the page (item 26.a). The account has no session until
 * the e-mail is confirmed, so the acceptance travels with the sign-up instead of a later call.
 */
const signUpBodySchema = z
  .object({
    name: nameSchema,
    acceptedTermsVersion: z.literal(TERMS_VERSION, {
      error: "Marque que você aceita os termos para criar a conta.",
    }),
  })
  .passthrough();

export type SignUpBody = z.output<typeof signUpBodySchema>;

/** Returns the parsed body, or the first message to show when it is not valid. */
export function parseSignUpBody(
  body: unknown,
): { success: true; data: SignUpBody } | { success: false; message: string } {
  const parsed = signUpBodySchema.safeParse(body);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  return { success: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
}
