import { formatCnpj } from "./account-documents.ts";

/**
 * The 44-digit access key of an NF-e (Manual de Orientação do Contribuinte, "Chave de Acesso"):
 * state (2), year and month (4), issuer's CNPJ (14), model (2), series (3), number (9), issue type
 * (1), random code (8) and a check digit (1, modulo 11).
 */
const ACCESS_KEY_LENGTH = 44;
const NFE_MODEL = "55";
const FIRST_WEIGHT = 2;
const LAST_WEIGHT = 9;
const MODULO = 11;

export interface AccessKeyParts {
  /** The 44 digits. */
  readonly accessKey: string;
  readonly issuerCnpj: string;
  readonly model: string;
  /** Without the leading zeros: "1", not "001". */
  readonly series: string;
  /** Without the leading zeros: "4821", not "000004821". */
  readonly number: string;
  /** "2611" for November 2026, as the key carries it. */
  readonly yearMonth: string;
}

function checkDigit(first43: string): number {
  let sum = 0;
  let weight = FIRST_WEIGHT;
  for (let index = first43.length - 1; index >= 0; index -= 1) {
    sum += Number(first43[index]) * weight;
    weight = weight === LAST_WEIGHT ? FIRST_WEIGHT : weight + 1;
  }
  const remainder = sum % MODULO;
  return remainder < 2 ? 0 : MODULO - remainder;
}

function withoutLeadingZeros(digits: string): string {
  const trimmed = digits.replace(/^0+/, "");
  return trimmed === "" ? "0" : trimmed;
}

/** The key's digits, spaces and dots aside, as people copy it from a DANFE. */
export function accessKeyDigits(input: string): string {
  return input.replace(/[\s.\-/]/g, "");
}

/** The key's parts, or null when it is not 44 digits with a matching check digit. */
export function parseAccessKey(input: string): AccessKeyParts | null {
  const accessKey = accessKeyDigits(input);
  if (!/^\d+$/.test(accessKey) || accessKey.length !== ACCESS_KEY_LENGTH) {
    return null;
  }
  if (checkDigit(accessKey.slice(0, -1)) !== Number(accessKey.at(-1))) {
    return null;
  }
  return {
    accessKey,
    yearMonth: accessKey.slice(2, 6),
    issuerCnpj: accessKey.slice(6, 20),
    model: accessKey.slice(20, 22),
    series: withoutLeadingZeros(accessKey.slice(22, 25)),
    number: withoutLeadingZeros(accessKey.slice(25, 34)),
  };
}

/**
 * Why the typed text is not an access key (length, letters, a swapped digit), or null when it is
 * one; what can be told before knowing who issued it.
 */
export function accessKeyFormatProblem(input: string): string | null {
  const digits = accessKeyDigits(input);
  if (!/^\d*$/.test(digits)) {
    return "A chave de acesso tem só números. Copie de novo da nota.";
  }
  if (digits.length !== ACCESS_KEY_LENGTH) {
    return `A chave de acesso tem 44 números, e esta tem ${digits.length}. Copie de novo da nota.`;
  }
  if (parseAccessKey(digits) === null) {
    return "Esta chave não confere: algum número está trocado. Copie de novo da nota.";
  }
  return null;
}

/**
 * Why a key cannot stand for the reseller's sale note (venda à ordem), in the reseller's words, or
 * null when it can: a valid NF-e key issued by the reseller's own CNPJ.
 *
 * @param resellerCnpj - The reseller company's CNPJ, digits only.
 */
export function resellerAccessKeyProblem(input: string, resellerCnpj: string): string | null {
  const formatProblem = accessKeyFormatProblem(input);
  const parts = parseAccessKey(input);
  if (formatProblem !== null || parts === null) {
    return formatProblem;
  }
  if (parts.model !== NFE_MODEL) {
    return "Esta chave não é de uma NF-e (modelo 55). Use a chave da nota de venda ao comprador.";
  }
  if (parts.issuerCnpj !== resellerCnpj) {
    return `Esta nota foi emitida pelo CNPJ ${formatCnpj(parts.issuerCnpj)}. Use a nota emitida pela sua empresa, CNPJ ${formatCnpj(resellerCnpj)}.`;
  }
  return null;
}
