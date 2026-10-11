import { z } from "zod";

/**
 * Events the platform publishes to integrators, through `GET /api/v1/events` and webhooks.
 * Each payload is a small snapshot: enough to act on, with ids to fetch the rest.
 */
export const orderEventDataSchema = z.object({
  orderId: z.uuid(),
  externalOrderId: z.string(),
  storeId: z.uuid(),
  status: z.string(),
  previousStatus: z.string().nullable(),
  totalCents: z.number().int(),
  orderedAt: z.iso.datetime(),
});
export type OrderEventData = z.infer<typeof orderEventDataSchema>;

export const listingEventDataSchema = z.object({
  listingId: z.uuid(),
  listingTargetId: z.uuid(),
  storeId: z.uuid(),
  status: z.string(),
  externalUrl: z.string().nullable(),
  errorReason: z.string().nullable(),
});
export type ListingEventData = z.infer<typeof listingEventDataSchema>;

export const API_EVENT_TYPES = [
  "order.created",
  "order.status_changed",
  "listing.published",
  "listing.failed",
] as const;
export const apiEventTypeSchema = z.enum(API_EVENT_TYPES);
export type ApiEventType = z.infer<typeof apiEventTypeSchema>;

export const API_EVENT_DATA_SCHEMAS = {
  "order.created": orderEventDataSchema,
  "order.status_changed": orderEventDataSchema,
  "listing.published": listingEventDataSchema,
  "listing.failed": listingEventDataSchema,
} as const satisfies Record<ApiEventType, z.ZodType>;

export type ApiEventData<TType extends ApiEventType> = z.infer<
  (typeof API_EVENT_DATA_SCHEMAS)[TType]
>;

export const API_EVENT_LABELS: Record<ApiEventType, string> = {
  "order.created": "Pedido recebido",
  "order.status_changed": "Pedido mudou de status",
  "listing.published": "Anúncio publicado numa loja",
  "listing.failed": "Anúncio recusado por uma loja",
};
