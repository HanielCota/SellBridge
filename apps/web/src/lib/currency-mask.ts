import { parseBrlToCents } from "@sellbridge/shared/money";

/** Up to R$ 9.999.999,99; more digits than that are ignored as they are typed. */
const MAX_DIGITS = 9;

const amountFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Cents as the price field shows them: "1.259,90", without the currency symbol. */
export function formatCentsForField(cents: number): string {
  return amountFormatter.format(cents / 100);
}

/**
 * Money typed like on a card machine: only digits count and the last two are the cents, so
 * "1", "12", "1259" read "0,01", "0,12", "12,59" and the separators follow by themselves.
 * Pasted text such as "R$ 1.259,90" keeps working. Empty when there is no digit left.
 */
export function maskCurrencyInput(typed: string): string {
  const digits = typed.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
  if (digits.length === 0) {
    return "";
  }
  return formatCentsForField(Number.parseInt(digits, 10));
}

/** The largest amount the field holds: `MAX_DIGITS` digits of cents. */
const MAX_FIELD_CENTS = 10 ** MAX_DIGITS - 1;

/**
 * A whole amount pasted into the field, read as written: "59.9" is R$ 59,90 and "R$ 1.259,9" is
 * R$ 1.259,90, where the card-machine mask (last two digits are the cents) read them as 5,99 and
 * 125,99. Null when the text is not an amount the field can hold, so the paste is refused
 * instead of becoming another number.
 */
export function readPastedCurrency(pasted: string): string | null {
  const cents = parseBrlToCents(pasted);
  if (cents === null || cents <= 0 || cents > MAX_FIELD_CENTS) {
    return null;
  }
  return formatCentsForField(cents);
}
