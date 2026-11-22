import { z } from "zod";
import { validationError } from "../runtime/errors.ts";
import type { MARKETPLACES } from "../schemas/stores.ts";
import { firstBusinessDayFrom } from "./business-calendar.ts";
import { brazilDay, shiftDay } from "./support-performance/calendar.ts";

/*
 * The cutoff time of each marketplace (contracts, 20/11/2026): a sale that reaches the supplier
 * before it is posted by the end of that business day; one after it, by the end of the next
 * business day. The marketplace's own date wins when it sends one (Mercado Livre's already
 * applies the store's cutoff); this rule fills in when it does not.
 */

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MILLISECONDS_PER_MINUTE = 60_000;
/** Brazil has had no daylight saving time since 2019, so Brasília is always UTC−3. */
const BRASILIA_OFFSET_IN_MINUTES = -3 * MINUTES_PER_HOUR;

export const CUTOFF_MINUTES_MIN = 0;
export const CUTOFF_MINUTES_MAX = MINUTES_PER_DAY - 1;

/** Minutes after midnight in Brasília: Mercado Livre 14h30, Shopee 13h, TikTok Shop 18h. */
export const DEFAULT_CUTOFF_MINUTES: Record<(typeof MARKETPLACES)[number], number> = {
  mercado_livre: 14 * MINUTES_PER_HOUR + 30,
  shopee: 13 * MINUTES_PER_HOUR,
  tiktok_shop: 18 * MINUTES_PER_HOUR,
};

function minutesOfBrazilDay(date: Date): number {
  const shifted = new Date(date.getTime() + BRASILIA_OFFSET_IN_MINUTES * MILLISECONDS_PER_MINUTE);
  return shifted.getUTCHours() * MINUTES_PER_HOUR + shifted.getUTCMinutes();
}

function assertCutoffMinutes(cutoffMinutes: number): void {
  if (
    !Number.isInteger(cutoffMinutes) ||
    cutoffMinutes < CUTOFF_MINUTES_MIN ||
    cutoffMinutes > CUTOFF_MINUTES_MAX
  ) {
    throw validationError(
      `Invalid cutoff: got ${cutoffMinutes} minutes, expected an integer from ${CUTOFF_MINUTES_MIN} to ${CUTOFF_MINUTES_MAX}.`,
    );
  }
}

/**
 * The day (YYYY-MM-DD, Brasília) a parcel must be posted by, from when the supplier's clock
 * started. Exactly at the cutoff already counts as after it.
 *
 * @throws {AppError} VALIDATION when the date is invalid or the cutoff is outside 0–1439.
 */
export function cutoffPostingDay(clockStartedAt: Date, cutoffMinutes: number): string {
  if (Number.isNaN(clockStartedAt.getTime())) {
    throw validationError(`Invalid date for the posting day: got ${String(clockStartedAt)}.`);
  }
  assertCutoffMinutes(cutoffMinutes);
  const day = brazilDay(clockStartedAt);
  const beforeCutoff = minutesOfBrazilDay(clockStartedAt) < cutoffMinutes;
  return firstBusinessDayFrom(beforeCutoff ? day : shiftDay(day, 1));
}

/** "14:30" for 870 minutes. */
export function formatCutoffTime(cutoffMinutes: number): string {
  const hours = Math.floor(cutoffMinutes / MINUTES_PER_HOUR);
  const minutes = cutoffMinutes % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const cutoffTimeField = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Escreva a hora como 14:30, de 00:00 a 23:59")
  .transform((time) => {
    const [hours = "0", minutes = "0"] = time.split(":");
    return Number(hours) * MINUTES_PER_HOUR + Number(minutes);
  });

/** The admin's form: the switch and each marketplace's cutoff, typed as "HH:MM". */
export const dispatchCutoffSettingsSchema = z.object({
  enabled: z.boolean(),
  mercadoLivre: cutoffTimeField,
  shopee: cutoffTimeField,
  tiktokShop: cutoffTimeField,
});
export type DispatchCutoffSettingsInput = z.input<typeof dispatchCutoffSettingsSchema>;
