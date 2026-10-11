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
