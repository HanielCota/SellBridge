import type {
  WebhookDeliverySummary,
  WebhookEndpointSummary,
} from "@sellbridge/database/repositories";
import { apiEventTypeSchema } from "@sellbridge/shared/public-api";
import { z } from "zod";

export const webhookEndpointSchema = z.object({
  id: z.uuid(),
  url: z.string().describe("Para onde os eventos são enviados (POST)."),
  description: z.string().nullable(),
  eventTypes: z
    .array(apiEventTypeSchema)
    .describe("Tipos de evento enviados. Vazio: todos, inclusive tipos criados no futuro."),
  enabled: z.boolean().describe("Endpoints desativados não recebem eventos novos."),
  createdAt: z.iso.datetime(),
});

export const webhookDeliverySchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  eventType: z.string(),
  status: z
    .enum(["pending", "succeeded", "failed"])
    .describe(
      "`pending`: aguardando envio ou nova tentativa; `succeeded`: respondeu 2xx; `failed`: tentativas esgotadas.",
    ),
  attempts: z.number().int().describe("Tentativas feitas (máximo 8)."),
  lastStatusCode: z.number().int().nullable().describe("Status HTTP da última tentativa."),
  lastError: z.string().nullable(),
  nextAttemptAt: z.iso.datetime().nullable().describe("Próxima tentativa, quando `pending`."),
  deliveredAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export function presentWebhookEndpoint(endpoint: WebhookEndpointSummary) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    eventTypes: endpoint.eventTypes.flatMap((type) => {
      const parsed = apiEventTypeSchema.safeParse(type);
      return parsed.success ? [parsed.data] : [];
    }),
    enabled: endpoint.disabledAt === null,
    createdAt: endpoint.createdAt.toISOString(),
  };
}

export function presentWebhookDelivery(delivery: WebhookDeliverySummary) {
  return {
    id: delivery.id,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    status: delivery.status,
    attempts: delivery.attempts,
    lastStatusCode: delivery.lastStatusCode,
    lastError: delivery.lastError,
    nextAttemptAt: delivery.status === "pending" ? delivery.nextAttemptAt.toISOString() : null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
  };
}
