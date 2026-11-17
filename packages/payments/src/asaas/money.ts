/** Asaas takes and returns amounts in reais with two decimals; SellBridge keeps cents. */

/**
 * The amount Asaas expects for a value in cents.
 *
 * @throws {RangeError} When the cents are not a non-negative integer.
 */
export function asaasValueFromCents(cents: number): number {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`Amount in cents must be a non-negative integer: ${cents}`);
  }
  return cents / 100;
}

/**
 * Cents for an amount Asaas returned in reais.
 *
 * @throws {RangeError} When the amount is negative or not a finite number.
 */
export function centsFromAsaasValue(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Asaas amount must be a finite non-negative number: ${value}`);
  }
  return Math.round(value * 100);
}

const SAO_PAULO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** A charge's due date (`YYYY-MM-DD`, Brasília calendar) a number of days from now. */
export function asaasDueDate(now: Date, daysAhead: number): string {
  if (!Number.isInteger(daysAhead) || daysAhead < 0) {
    throw new RangeError(`Days ahead must be a non-negative integer: ${daysAhead}`);
  }
  return SAO_PAULO_DATE.format(new Date(now.getTime() + daysAhead * DAY_IN_MS));
}
