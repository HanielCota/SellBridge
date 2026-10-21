import {
  countWebhookEndpoints,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  lockBillingTenant,
  setWebhookEndpointDisabled,
  type WebhookDeliverySummary,
  type WebhookEndpointSummary,
} from "@sellbridge/database/repositories";
import { conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tokenCipher } from "@/lib/server/marketplaces";
import { assertAcceptableWebhookUrl, generateWebhookSecret } from "./webhook-rules.server";
import {
  type CreateWebhookEndpointRequest,
  MAX_WEBHOOK_ENDPOINTS,
  RECENT_WEBHOOK_DELIVERIES,
} from "./webhooks";

/**
 * Who did it, for the audit log: a person in the app or an API key. Spread into log fields.
 */
export type WebhookActor = { userId: string } | { apiKeyId: string };

export interface WebhookEndpointWithDeliveries extends WebhookEndpointSummary {
  recentDeliveries: WebhookDeliverySummary[];
}

export interface IssuedWebhookEndpoint {
  endpoint: WebhookEndpointSummary;
  /** The signing secret, returned only on creation; the worker keeps it encrypted. */
  secret: string;
}

/** Development and test receivers run on localhost over plain http. */
function allowsPrivateUrls(): boolean {
  return environment.WEBHOOK_ALLOW_PRIVATE_URLS || environment.NODE_ENV !== "production";
}

export async function listOrganizationWebhookEndpoints(
  tenantId: string,
): Promise<WebhookEndpointWithDeliveries[]> {
  const endpoints = await listWebhookEndpoints(database, tenantId);
  return Promise.all(
    endpoints.map(async (endpoint) => ({
      ...endpoint,
      recentDeliveries: await listWebhookDeliveries(database, tenantId, {
        endpointId: endpoint.id,
        limit: RECENT_WEBHOOK_DELIVERIES,
      }),
    })),
  );
}

/**
 * Counted and created under the organization's lock: parallel requests (the API takes 120 a
 * minute) would otherwise all read "9" and pass the cap together, and every endpoint multiplies
 * the deliveries the worker sends for every event.
 */
export async function createOrganizationWebhookEndpoint(input: {
  tenantId: string;
  actor: WebhookActor;
  request: CreateWebhookEndpointRequest;
}): Promise<IssuedWebhookEndpoint> {
  assertAcceptableWebhookUrl(input.request.url, allowsPrivateUrls());
  const secret = generateWebhookSecret();
  const endpoint = await database.transaction(async (transaction) => {
    await lockBillingTenant(transaction, input.tenantId);
    if ((await countWebhookEndpoints(transaction, input.tenantId)) >= MAX_WEBHOOK_ENDPOINTS) {
      throw conflictError(
        `Sua organização já tem ${MAX_WEBHOOK_ENDPOINTS} endpoints de webhook. Exclua os que não usa antes de criar outro.`,
      );
    }
    return createWebhookEndpoint(transaction, input.tenantId, {
      url: input.request.url,
      description: input.request.description,
      eventTypes: input.request.eventTypes,
      secretEnc: tokenCipher.encrypt(secret),
    });
  });
  logger.info("webhook_endpoint.created", {
    ...input.actor,
    tenantId: input.tenantId,
    endpointId: endpoint.id,
    eventTypes: endpoint.eventTypes,
  });
  return { endpoint, secret };
}

export async function deleteOrganizationWebhookEndpoint(input: {
  tenantId: string;
  actor: WebhookActor;
  endpointId: string;
}): Promise<void> {
  await deleteWebhookEndpoint(database, input.tenantId, input.endpointId);
  logger.info("webhook_endpoint.deleted", {
    ...input.actor,
    tenantId: input.tenantId,
    endpointId: input.endpointId,
  });
}

export async function setOrganizationWebhookEndpointEnabled(input: {
  tenantId: string;
  actor: WebhookActor;
  endpointId: string;
  enabled: boolean;
}): Promise<WebhookEndpointSummary> {
  const endpoint = await setWebhookEndpointDisabled(database, {
    tenantId: input.tenantId,
    endpointId: input.endpointId,
    disabled: !input.enabled,
  });
  logger.info(input.enabled ? "webhook_endpoint.enabled" : "webhook_endpoint.disabled", {
    ...input.actor,
    tenantId: input.tenantId,
    endpointId: input.endpointId,
  });
  return endpoint;
}

/** 404 for an endpoint of another organization, instead of an empty list. */
export async function listOrganizationWebhookDeliveries(
  tenantId: string,
  query: { endpointId: string; limit: number },
): Promise<WebhookDeliverySummary[]> {
  await getWebhookEndpoint(database, tenantId, query.endpointId);
  return listWebhookDeliveries(database, tenantId, query);
}
