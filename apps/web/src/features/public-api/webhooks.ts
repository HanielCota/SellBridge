import { apiEventTypeSchema } from "@sellbridge/shared/public-api";
import { z } from "zod";
import { freeText } from "@sellbridge/shared/schemas";

/** A handful per organization (ERP, BI, staging...); more usually means forgotten endpoints. */
export const MAX_WEBHOOK_ENDPOINTS = 10;

/** Deliveries shown per endpoint on the settings page. */
export const RECENT_WEBHOOK_DELIVERIES = 5;

/**
 * Shape checks shared by the form, the server function and the public API. Whether the URL may
 * be http or point to a private network depends on the environment and is checked on the server.
 */
export const webhookUrlSchema = freeText()
  .trim()
  .max(2000, "Use uma URL de até 2000 caracteres")
  .pipe(z.url({ protocol: /^https?$/, error: "Informe uma URL http(s) válida" }));

export const webhookDescriptionSchema = freeText()
  .trim()
  .max(200, "Use até 200 caracteres")
  .transform((value) => (value.length === 0 ? null : value));

export const webhookEventTypesSchema = z
  .array(apiEventTypeSchema)
  .transform((types) => [...new Set(types)]);

export const createWebhookEndpointInputSchema = z.object({
  url: webhookUrlSchema,
  description: webhookDescriptionSchema.nullable().default(null),
  /** Empty: every event type, including ones added later. */
  eventTypes: webhookEventTypesSchema.default([]),
});
export type CreateWebhookEndpointInput = z.input<typeof createWebhookEndpointInputSchema>;
export type CreateWebhookEndpointRequest = z.output<typeof createWebhookEndpointInputSchema>;

export type WebhookDeliveryStatus = "pending" | "succeeded" | "failed";

export const WEBHOOK_DELIVERY_STATUS_LABELS: Record<WebhookDeliveryStatus, string> = {
  pending: "Aguardando",
  succeeded: "Entregue",
  failed: "Falhou",
};
