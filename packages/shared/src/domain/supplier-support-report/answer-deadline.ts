import { validationError } from "../../runtime/errors.ts";
import { brazilDay, shiftDay, weekdayOfDay } from "../support-performance/calendar.ts";

/*
 * Golden rule 4: a store's message gets an answer by the next business day. A message on Friday
 * afternoon is on time until Monday ends; one on Saturday, too. Business days are Monday to
 * Friday on the Brasília calendar; national holidays are not known yet and count as business days.
 */

/** Saturday and Sunday, with Monday = 0. */
const FIRST_WEEKEND_DAY = 5;

// Brazil has had no daylight saving time since 2019, so Brasília midnight is always UTC−3.
function startOfBrazilDay(day: string): Date {
  return new Date(`${day}T00:00:00-03:00`);
}

function nextBusinessDay(day: string): string {
  let next = shiftDay(day, 1);
  while (weekdayOfDay(next) >= FIRST_WEEKEND_DAY) {
    next = shiftDay(next, 1);
  }
  return next;
}

/**
 * The moment the answer to a message received at `receivedAt` becomes late: midnight after the
 * next business day, in Brasília. An answer before it is on time.
 *
 * @throws {AppError} VALIDATION when `receivedAt` is not a valid date.
 */
export function answerDeadline(receivedAt: Date): Date {
  if (Number.isNaN(receivedAt.getTime())) {
    throw validationError(
      `Invalid date for the answer deadline: got ${String(receivedAt)}, expected a valid Date.`,
    );
  }
  return startOfBrazilDay(shiftDay(nextBusinessDay(brazilDay(receivedAt)), 1));
}
