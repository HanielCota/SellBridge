import { shiftDay, weekdayOfDay } from "./support-performance/calendar.ts";

/*
 * Business days on the Brasília calendar: Monday to Friday, except Brazil's national holidays
 * (Guilherme, 21/11/2026: Carnaval and Corpus Christi count as holidays, as banks and most
 * carriers close on them). State and city holidays are out: one supplier's town is not another's.
 */

/** Saturday and Sunday, with Monday = 0. */
const FIRST_WEEKEND_DAY = 5;

/** The fixed national holidays, as MM-DD (Lei 662/1949, 6.802/1980 and 14.759/2023). */
const FIXED_HOLIDAYS = [
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
] as const;

/** Days from Easter Sunday: Carnaval Monday and Tuesday, Good Friday and Corpus Christi. */
const EASTER_OFFSETS = [-48, -47, -2, 60] as const;

/** The longest real run of days off is a few days; a longer search means a broken calendar. */
const MAX_DAYS_TO_NEXT_BUSINESS_DAY = 15;

/** YYYY-MM-DD of Easter Sunday (anonymous Gregorian algorithm, Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const golden = year % 19;
  const century = Math.floor(year / 100);
  const yearOfCentury = year % 100;
  const leapCenturies = Math.floor(century / 4);
  const centuryRemainder = century % 4;
  const lunarCorrection = Math.floor((century + 8) / 25);
  const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3);
  const epact = (19 * golden + century - leapCenturies - solarCorrection + 15) % 30;
  const weekdayCorrection =
    (32 + 2 * centuryRemainder + 2 * Math.floor(yearOfCentury / 4) - epact - (yearOfCentury % 4)) %
    7;
  const monthCorrection = Math.floor((golden + 11 * epact + 22 * weekdayCorrection) / 451);
  const dayOfMarch = epact + weekdayCorrection - 7 * monthCorrection + 114;
  const month = Math.floor(dayOfMarch / 31);
  const day = (dayOfMarch % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Brazil's national holidays of one year, as YYYY-MM-DD, sorted.
 *
 * @throws {RangeError} When `year` is not an integer between 1900 and 2199.
 */
export function brazilNationalHolidays(year: number): string[] {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) {
    throw new RangeError(`Invalid year for the holiday calendar: got ${year}, expected 1900–2199.`);
  }
  const easter = easterSunday(year);
  const movable = EASTER_OFFSETS.map((offset) => shiftDay(easter, offset));
  const fixed = FIXED_HOLIDAYS.map((monthDay) => `${year}-${monthDay}`);
  return [...fixed, ...movable].toSorted();
}

/** The national holidays of every year from `firstYear` to `lastYear`, both included. */
export function brazilNationalHolidaysBetween(firstYear: number, lastYear: number): string[] {
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  return years.flatMap((year) => brazilNationalHolidays(year));
}

function yearOfDay(day: string): number {
  return Number(day.slice(0, 4));
}

/** Whether a YYYY-MM-DD day is a working day: a weekday that is not a national holiday. */
export function isBrazilBusinessDay(day: string): boolean {
  if (weekdayOfDay(day) >= FIRST_WEEKEND_DAY) {
    return false;
  }
  return !brazilNationalHolidays(yearOfDay(day)).includes(day);
}

/**
 * The first business day on or after `day` (YYYY-MM-DD).
 *
 * @throws {RangeError} When no business day comes within 15 days, which only a broken calendar
 * could cause.
 */
export function firstBusinessDayFrom(day: string): string {
  const candidates = Array.from({ length: MAX_DAYS_TO_NEXT_BUSINESS_DAY }, (_, index) =>
    shiftDay(day, index),
  );
  const found = candidates.find((candidate) => isBrazilBusinessDay(candidate));
  if (found === undefined) {
    throw new RangeError(`No business day within ${MAX_DAYS_TO_NEXT_BUSINESS_DAY} days of ${day}.`);
  }
  return found;
}
