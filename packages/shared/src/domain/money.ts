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

/** Largest amount a money column (Postgres `integer`) can hold: R$ 21.474.836,47. */
export const MAX_STORED_CENTS = 2_147_483_647;

/** "1.234,56": dots group thousands, the comma marks the cents. */
const GROUPED_BRL = /^(-?)(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/;
/** "1234,5" or "12". */
const PLAIN_BRL = /^(-?)(\d+)(?:,(\d{1,2}))?$/;
/** "59.90": a dot followed by one or two digits can only be the decimal point. */
const DOT_DECIMAL_BRL = /^(-?)(\d+)\.(\d{1,2})$/;

/**
 * Parses user input such as "1.234,56", "1234,5", "59.90" or "12" into cents. Returns null
 * when the text is not an amount or is larger than a money column holds.
 */
export function parseBrlToCents(input: string): Cents | null {
  // Only a leading "R$" (after an optional minus) is a currency sign; "1R2" is not an amount.
  const compact = input.replace(/\s/g, "").replace(/^(-?)R\$/, "$1");
  const match =
    GROUPED_BRL.exec(compact) ?? PLAIN_BRL.exec(compact) ?? DOT_DECIMAL_BRL.exec(compact);
  if (match === null) {
    return null;
  }
  const [, minus = "", integerDigits = "0", fractionDigits = ""] = match;
  const magnitude =
    Number(integerDigits.replaceAll(".", "")) * 100 + Number(fractionDigits.padEnd(2, "0"));
  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_STORED_CENTS) {
    return null;
  }
  // "-0,00" is zero, not -0 (which the formatter would print as "-R$ 0,00").
  return minus === "-" && magnitude > 0 ? -magnitude : magnitude;
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
