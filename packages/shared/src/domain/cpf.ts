import { z } from "zod";

const CPF_LENGTH = 11;

/** Check digit of the first `length` digits, as the Receita Federal computes it. */
function checkDigit(digits: readonly number[], length: number): number {
  const sum = digits
    .slice(0, length)
    .reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

/** Eleven digits, not all the same, whose two check digits match. */
export function isValidCpf(input: string): boolean {
  const digitText = input.replace(/\D/g, "");
  if (digitText.length !== CPF_LENGTH || /^(\d)\1+$/.test(digitText)) {
    return false;
  }
  const digits = Array.from(digitText, Number);
  return checkDigit(digits, 9) === digits[9] && checkDigit(digits, 10) === digits[10];
}

/** Stored as digits only; the mask is presentation. */
export const cpfSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length === CPF_LENGTH, { message: "Informe os 11 dígitos do CPF" })
  .refine(isValidCpf, { message: "Confira o CPF: os dígitos não batem" });

export function normalizeCpf(input: string): string | null {
  const parsed = cpfSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

/** Masks while typing: 123.456.789-09, from however many digits are there. */
export function formatCpf(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, CPF_LENGTH);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}
