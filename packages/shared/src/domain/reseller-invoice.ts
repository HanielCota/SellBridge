/**
 * The reseller's own sale NF-e in venda à ordem (model B): the reseller issues it outside
 * SellBridge, and SellBridge reads it from the marketplace's order or takes the key the reseller
 * types. The supplier's notes reference it (decision of 18/11/2026, Margot plan "nota 1 lida ou
 * colada").
 */

const FIRST_CHECK_IN_MS = 5 * 60_000;
const LONGEST_CHECK_IN_MS = 60 * 60_000;

/**
 * When to read the marketplace again after `checks` reads without the note: 5 minutes, doubling,
 * at most an hour. A reseller issues the note when it suits them, so the reads never give up
 * while the sale goes ahead.
 *
 * @throws {RangeError} When `checks` is not a positive integer.
 */
export function nextResellerInvoiceCheckAt(checks: number, now: Date): Date {
  if (!Number.isInteger(checks) || checks < 1) {
    throw new RangeError(`Reseller invoice checks must be a positive integer, got ${checks}`);
  }
  const delay = Math.min(FIRST_CHECK_IN_MS * 2 ** (checks - 1), LONGEST_CHECK_IN_MS);
  return new Date(now.getTime() + delay);
}

/** The note as the marketplace reports it; the number and series come from the key otherwise. */
export interface MarketplaceSaleInvoice {
  readonly accessKey: string;
  readonly issuedAt: Date | null;
}
