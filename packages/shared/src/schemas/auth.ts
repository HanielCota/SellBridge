import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;

export const MAX_NAME_LENGTH = 100;

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Informe seu nome")
  .max(MAX_NAME_LENGTH, `O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres`);
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

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({ password: newPasswordSchema });
