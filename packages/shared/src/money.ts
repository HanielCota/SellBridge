import { ValidationError } from "./errors.ts";

/** Amount of money in integer cents (BRL). Never use floats for money. */
export type Cents = number;

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError("Valor monetário deve ser um inteiro em centavos");
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

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + assertCents(value), 0);
}

export function multiplyCents(cents: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity)) {
    throw new ValidationError("Quantidade deve ser um número inteiro");
  }
  return assertCents(cents) * quantity;
}

/** Applies a percentage expressed in basis points (1% = 100 bps), rounding half up. */
export function percentOfCents(cents: Cents, basisPoints: number): Cents {
  if (!Number.isSafeInteger(basisPoints)) {
    throw new ValidationError("Percentual deve ser informado em basis points inteiros");
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
