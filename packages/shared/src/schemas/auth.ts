import { z } from "zod";
import { freeText } from "./common.ts";

export const MIN_PASSWORD_LENGTH = 8;

/** Error code and message when a new password appears in known breaches (item 30.c). */
export const PASSWORD_COMPROMISED_CODE = "PASSWORD_COMPROMISED";
export const PASSWORD_COMPROMISED_MESSAGE =
  "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra.";

export const MAX_NAME_LENGTH = 100;

/**
 * Bidirectional overrides flip how the rest of a line reads, so a name could show as someone
 * else's. A name is shown to the staff next to others, so it never carries one.
 */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/;

export const nameSchema = freeText()
  .trim()
  .min(2, "Informe seu nome")
  .max(MAX_NAME_LENGTH, `O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`)
  .refine((name) => !BIDI_CONTROLS.test(name), "O nome tem caracteres inválidos");
export const emailSchema = z.email("Informe um e-mail válido");
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

/** The sign-up form: the account plus the box accepting the terms (item 26.a, L4). */
export const signUpFormSchema = signUpSchema.extend({
  acceptedTerms: z.literal(true, "Marque que você aceita os termos para criar a conta."),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({ password: newPasswordSchema });
