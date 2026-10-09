import { z } from "zod";

export const cepSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === 8, { message: "CEP deve ter 8 dígitos" });

export type Cep = z.infer<typeof cepSchema>;

export function normalizeCep(input: string): string | null {
  const parsed = cepSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) {
    return cep;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const stateSchema = z.enum(BRAZILIAN_STATES);
export type BrazilianState = z.infer<typeof stateSchema>;

export interface ResolvedAddress {
  cep: string;
  state: BrazilianState;
  city: string;
  neighborhood: string | null;
  street: string | null;
}
