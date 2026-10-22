import { freeText } from "@sellbridge/shared/schemas";
import { z } from "zod";

/** Which carrier source answers the tracking (env `CARRIER_TRACKING_PROVIDER`). */
export const CARRIER_TRACKING_PROVIDERS = ["off", "simulated"] as const;
export type CarrierTrackingProviderName = (typeof CARRIER_TRACKING_PROVIDERS)[number];

/**
 * What a carrier says happened to a parcel, reduced to the steps the explanation reads:
 * - `posted`: the carrier received the parcel (the first scan, "bipado");
 * - `in_transit`: moving between the carrier's units;
 * - `out_for_delivery`: on the courier's vehicle today;
 * - `delivery_failed`: a delivery attempt that did not work (buyer absent, wrong address);
 * - `awaiting_pickup`: waiting for the buyer at an agency or pickup point;
 * - `returning`: on its way back to the sender;
 * - `delivered`: handed to the buyer.
 */
export const CARRIER_EVENT_KINDS = [
  "posted",
  "in_transit",
  "out_for_delivery",
  "delivery_failed",
  "awaiting_pickup",
  "returning",
  "delivered",
] as const;
export type CarrierEventKind = (typeof CARRIER_EVENT_KINDS)[number];

export const carrierTrackingEventSchema = z.object({
  at: z.coerce.date(),
  /** "São Paulo/SP"; null when the carrier gives no place. */
  place: z.string().trim().max(120).nullable(),
  kind: z.enum(CARRIER_EVENT_KINDS),
  /** The carrier's own words, shown as given. */
  description: z.string().trim().min(1).max(300),
});
export type CarrierTrackingEvent = z.infer<typeof carrierTrackingEventSchema>;

/**
 * A provider's answer. `not_connected`: no carrier is connected yet (provider `off`);
 * `not_found`: the carrier does not know the code; `unavailable`: the carrier could not be
 * reached; `found`: its events, oldest first. `simulated` marks demonstration data.
 */
export const carrierTrackingResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("not_connected") }),
  z.object({ state: z.literal("not_found") }),
  z.object({ state: z.literal("unavailable") }),
  z.object({
    state: z.literal("found"),
    carrier: z.string().min(1),
    simulated: z.boolean(),
    events: z.array(carrierTrackingEventSchema),
  }),
]);
export type CarrierTrackingResult = z.infer<typeof carrierTrackingResultSchema>;

/** Correios format: two letters, nine digits, two letters (AA123456789BR). */
const CORREIOS_CODE_PATTERN = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

export const CORREIOS_CODE_EXAMPLE = "AA123456789BR";

/** "aa 123.456.789 br" → "AA123456789BR": spaces, dots and dashes are typing noise. */
export function normalizeTrackingInput(input: string): string {
  return input.replaceAll(/[\s.-]/g, "").toUpperCase();
}

export function isCorreiosCode(code: string): boolean {
  return CORREIOS_CODE_PATTERN.test(code);
}

/** Oldest first, whatever order the carrier sent them in. */
export function carrierEventsOldestFirst(
  events: readonly CarrierTrackingEvent[],
): CarrierTrackingEvent[] {
  return events.toSorted((left, right) => left.at.getTime() - right.at.getTime());
}

/** Longest thing worth searching: an order number or a code with some spaces typed in. */
export const TRACKING_QUERY_MAX_LENGTH = 60;

export const trackingQuerySchema = z.object({
  query: freeText()
    .trim()
    .min(1, "Digite o código de rastreio ou o número do pedido")
    .max(TRACKING_QUERY_MAX_LENGTH),
});
