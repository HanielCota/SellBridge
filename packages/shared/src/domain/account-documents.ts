import { z } from "zod";

const CNPJ_LENGTH = 14;
const FIRST_CNPJ_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const SECOND_CNPJ_WEIGHTS = [6, ...FIRST_CNPJ_WEIGHTS] as const;
/** Code of "0": the Receita counts each CNPJ character as its code minus this. */
const CNPJ_CHARACTER_BASE = 48;
const BRAZIL_COUNTRY_CODE = "55";

function digitsOf(input: string): string {
  return input.replace(/\D/g, "");
}

/** Letters and digits only, letters in upper case: the CNPJ may carry letters (IN RFB 2.229/2024). */
function cnpjCharactersOf(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * Check digit over the weights, as the Receita Federal computes it: each character counts its
 * code minus 48, so digits keep their value and letters count from 17 (A) up.
 */
function cnpjCheckDigit(characters: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, index) => {
    const code = characters.codePointAt(index) ?? CNPJ_CHARACTER_BASE;
    return total + weight * (code - CNPJ_CHARACTER_BASE);
  }, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Twelve letters or digits plus two check digits that match, not all characters the same. */
export function isValidCnpj(input: string): boolean {
  const characters = cnpjCharactersOf(input);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(characters) || /^(\w)\1+$/.test(characters)) {
    return false;
  }
  return (
    cnpjCheckDigit(characters, FIRST_CNPJ_WEIGHTS) === Number(characters[12]) &&
    cnpjCheckDigit(characters, SECOND_CNPJ_WEIGHTS) === Number(characters[13])
  );
}

/** Stored as upper-case letters and digits; the mask is presentation. */
export const cnpjSchema = z
  .string()
  .trim()
  .transform(cnpjCharactersOf)
  .refine((value) => value.length === CNPJ_LENGTH, {
    message: "Informe os 14 caracteres do CNPJ",
  })
  .refine(isValidCnpj, { message: "Confira o CNPJ: os dígitos não batem" });

/** Masks while typing: 11.222.333/0001-81 or 12.ABC.345/01DE-35, from what is there. */
export function formatCnpj(input: string): string {
  return cnpjCharactersOf(input)
    .slice(0, CNPJ_LENGTH)
    .replace(/^(\w{2})(\w)/, "$1.$2")
    .replace(/^(\w{2})\.(\w{3})(\w)/, "$1.$2.$3")
    .replace(/\.(\w{3})(\w)/, ".$1/$2")
    .replace(/(\w{4})(\w{1,2})$/, "$1-$2");
}

/** Digits with area code; a pasted +55 is dropped (12 or 13 digits starting with 55). */
function nationalPhoneDigits(input: string): string {
  const digits = digitsOf(input);
  const withCountryCode = digits.length >= 12 && digits.startsWith(BRAZIL_COUNTRY_CODE);
  return withCountryCode ? digits.slice(BRAZIL_COUNTRY_CODE.length) : digits;
}

/**
 * A Brazilian phone with area code, digits only: a mobile (11 digits, starting with 9 after the
 * area code) or a landline (10 digits, starting with 2 to 5).
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform(nationalPhoneDigits)
  .refine((value) => /^[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(value), {
    message: "Informe o telefone com DDD, como (11) 98765-4321",
  });

/** Masks while typing: (11) 98765-4321 or (31) 3333-4444. */
export function formatPhone(input: string): string {
  const digits = nationalPhoneDigits(input).slice(0, 11);
  if (digits.length <= 2) {
    return digits.length === 0 ? "" : `(${digits}`;
  }
  const area = `(${digits.slice(0, 2)}) `;
  const local = digits.slice(2);
  const splitAt = local.length > 8 ? 5 : 4;
  if (local.length <= splitAt) {
    return `${area}${local}`;
  }
  return `${area}${local.slice(0, splitAt)}-${local.slice(splitAt)}`;
}
