import { z } from "zod";
import { dataEnvelope, defineApiEndpoint, noInput } from "../endpoint";
import { createWebhookEndpointInputSchema } from "../webhooks";
import {
  createOrganizationWebhookEndpoint,
  deleteOrganizationWebhookEndpoint,
  listOrganizationWebhookDeliveries,
  listOrganizationWebhookEndpoints,
} from "../webhooks.server";
import {
  presentWebhookDelivery,
  presentWebhookEndpoint,
  webhookDeliverySchema,
  webhookEndpointSchema,
} from "./webhooks.presenter";

const TAG = "Webhooks";

const endpointIdParamsSchema = z.object({
  endpointId: z.uuid().describe("ID do endpoint de webhook."),
});

export const listWebhookEndpoints = defineApiEndpoint({
  method: "GET",
  path: "/webhook-endpoints",
  operationId: "listWebhookEndpoints",
  tag: TAG,
  summary: "Listar endpoints de webhook",
  description:
    "Endpoints cadastrados na organização, do mais novo ao mais antigo. O segredo nunca é devolvido.",
  scope: "webhooks:manage",
  params: noInput,
  query: noInput,
  body: noInput,
  response: dataEnvelope(z.array(webhookEndpointSchema)),
  handle: async ({ context }) => {
    const endpoints = await listOrganizationWebhookEndpoints(context.tenantId);
    return { data: endpoints.map(presentWebhookEndpoint) };
  },
});

export const createWebhookEndpoint = defineApiEndpoint({
  method: "POST",
  path: "/webhook-endpoints",
  operationId: "createWebhookEndpoint",
  tag: TAG,
  summary: "Criar endpoint de webhook",
  description:
    "Cadastra uma URL https que receberá os eventos por POST, assinados no header `SellBridge-Signature` " +
    '(`t=<unix>,v1=<HMAC-SHA256 hex de "<t>.<corpo>">`). O `secret` (`whsec_...`) vem só nesta resposta: guarde-o. ' +
    "Responda 2xx em até 10 s; falhas são tentadas de novo até 8 vezes ao longo de cerca de 11 horas. Exige `Idempotency-Key`.",
  scope: "webhooks:manage",
  params: noInput,
  query: noInput,
  body: createWebhookEndpointInputSchema,
  response: dataEnvelope(
    webhookEndpointSchema.extend({
      secret: z.string().describe("Segredo de assinatura. Mostrado só uma vez."),
    }),
  ),
  successStatus: 201,
  handle: async ({ context, body }) => {
    const issued = await createOrganizationWebhookEndpoint({
      tenantId: context.tenantId,
      actor: { apiKeyId: context.apiKeyId },
      request: body,
    });
    return { data: { ...presentWebhookEndpoint(issued.endpoint), secret: issued.secret } };
  },
});

export const deleteWebhookEndpoint = defineApiEndpoint({
  method: "DELETE",
  path: "/webhook-endpoints/{endpointId}",
  operationId: "deleteWebhookEndpoint",
  tag: TAG,
  summary: "Excluir endpoint de webhook",
  description: "Exclui o endpoint e as entregas dele; entregas pendentes não serão enviadas.",
  scope: "webhooks:manage",
  params: endpointIdParamsSchema,
  query: noInput,
  body: noInput,
  response: dataEnvelope(z.object({ id: z.uuid(), deleted: z.literal(true) })),
  handle: async ({ context, params }) => {
    await deleteOrganizationWebhookEndpoint({
      tenantId: context.tenantId,
      actor: { apiKeyId: context.apiKeyId },
      endpointId: params.endpointId,
    });
    return { data: { id: params.endpointId, deleted: true as const } };
  },
});

export const listWebhookDeliveries = defineApiEndpoint({
  method: "GET",
  path: "/webhook-endpoints/{endpointId}/deliveries",
  operationId: "listWebhookDeliveries",
  tag: TAG,
  summary: "Listar entregas de um endpoint",
  description:
    "Entregas mais recentes do endpoint, da mais nova à mais antiga, com o resultado da última tentativa.",
  scope: "webhooks:manage",
  params: endpointIdParamsSchema,
  query: z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .describe("Máximo de entregas (1 a 100)."),
  }),
  body: noInput,
  response: dataEnvelope(z.array(webhookDeliverySchema)),
  handle: async ({ context, params, query }) => {
    const deliveries = await listOrganizationWebhookDeliveries(context.tenantId, {
      endpointId: params.endpointId,
      limit: query.limit,
    });
    return { data: deliveries.map(presentWebhookDelivery) };
  },
});
