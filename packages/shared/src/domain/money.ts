import { validationError } from "../runtime/errors.ts";

/** Amount of money in integer cents (BRL). Never use floats for money. */
export type Cents = number;

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw validationError("Valor monetário deve ser um inteiro em centavos");
  }
  return value;
}

export function formatCents(cents: Cents): string {
  return brlFormatter.format(assertCents(cents) / 100);
}

/**
 * Parses user input such as "1.234,56", "1234,5" or "12" into cents.
 * Returns null when the text is not a valid amount.
 */
export function parseBrlToCents(input: string): Cents | null {
  const normalized = input
    .replace(/[R$\s]/g, "")
    .replaceAll(".", "")
    .replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const [integerPart = "0", fractionPart = ""] = normalized.split(".");
  const sign = integerPart.startsWith("-") ? -1 : 1;
  const absoluteInteger = Math.abs(Number.parseInt(integerPart, 10));
  const fraction = Number.parseInt(fractionPart.padEnd(2, "0"), 10);
  return sign * (absoluteInteger * 100 + fraction);
}

/** Cents as the text a BRL input shows ("1234,50"); an absent amount is an empty field. */
export function formatCentsForInput(cents: Cents | undefined): string {
  if (cents === undefined) {
    return "";
  }
  return (assertCents(cents) / 100).toFixed(2).replace(".", ",");
}

/**
 * Parses an optional BRL field such as a filter bound: blank, invalid or negative
 * input means "no amount" instead of an error.
 */
export function parseOptionalBrlToCents(input: string): Cents | undefined {
  if (input.trim().length === 0) {
    return undefined;
  }
  const cents = parseBrlToCents(input);
  if (cents === null || cents < 0) {
    return undefined;
  }
  return cents;
}

/** Applies a percentage expressed in basis points (1% = 100 bps), rounding half up. */
export function percentOfCents(cents: Cents, basisPoints: number): Cents {
  if (!Number.isSafeInteger(basisPoints)) {
    throw validationError("Percentual deve ser informado em basis points inteiros");
  }
  return Math.round((assertCents(cents) * basisPoints) / 10_000);
}

/** Ratio between two amounts as a percentage with one decimal, or null when the base is zero. */
export function percentChange(current: Cents, previous: Cents): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
