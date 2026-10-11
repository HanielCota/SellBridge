import { notFoundError } from "@sellbridge/shared/errors";
import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { webhookEndpoints } from "../schema/index.ts";

/** An endpoint as callers see it: the encrypted secret is read only by `getWebhookEndpointSecret`. */
export interface WebhookEndpointSummary {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  disabledAt: Date | null;
  createdAt: Date;
}

const summaryColumns = {
  id: webhookEndpoints.id,
  url: webhookEndpoints.url,
  description: webhookEndpoints.description,
  eventTypes: webhookEndpoints.eventTypes,
  disabledAt: webhookEndpoints.disabledAt,
  createdAt: webhookEndpoints.createdAt,
};

export interface NewWebhookEndpoint {
  url: string;
  description: string | null;
  /** Empty means every event type. */
  eventTypes: readonly string[];
  /** Already encrypted with the token cipher. */
  secretEnc: string;
}

function endpointCondition(tenantId: string, endpointId: string) {
  return and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, endpointId));
}

export async function createWebhookEndpoint(
  database: Database,
  tenantId: string,
  endpoint: NewWebhookEndpoint,
): Promise<WebhookEndpointSummary> {
  const [created] = await database
    .insert(webhookEndpoints)
    .values({ ...endpoint, tenantId, eventTypes: [...endpoint.eventTypes] })
    .returning(summaryColumns);
  if (!created) {
    throw new Error("Não foi possível gravar o endpoint de webhook");
  }
  return created;
}

/** Newest first, disabled endpoints included so they can be turned back on. */
export async function listWebhookEndpoints(
  database: Database,
  tenantId: string,
): Promise<WebhookEndpointSummary[]> {
  return database
    .select(summaryColumns)
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.tenantId, tenantId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export async function countWebhookEndpoints(database: Database, tenantId: string): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.tenantId, tenantId));
  return row?.total ?? 0;
}

export async function getWebhookEndpoint(
  database: Database,
  tenantId: string,
  endpointId: string,
): Promise<WebhookEndpointSummary> {
  const [endpoint] = await database
    .select(summaryColumns)
    .from(webhookEndpoints)
    .where(endpointCondition(tenantId, endpointId));
  if (!endpoint) {
    throw notFoundError("Endpoint de webhook não encontrado");
  }
  return endpoint;
}

/** Deleting an endpoint also drops its deliveries (foreign key cascade). */
export async function deleteWebhookEndpoint(
  database: Database,
  tenantId: string,
  endpointId: string,
): Promise<void> {
  const deleted = await database
    .delete(webhookEndpoints)
    .where(endpointCondition(tenantId, endpointId))
    .returning({ id: webhookEndpoints.id });
  if (deleted.length === 0) {
    throw notFoundError("Endpoint de webhook não encontrado");
  }
}

/** A disabled endpoint gets no new deliveries and its pending ones wait until it is enabled. */
export async function setWebhookEndpointDisabled(
  database: Database,
  target: { tenantId: string; endpointId: string; disabled: boolean },
): Promise<WebhookEndpointSummary> {
  const [updated] = await database
    .update(webhookEndpoints)
    .set({ disabledAt: target.disabled ? new Date() : null })
    .where(endpointCondition(target.tenantId, target.endpointId))
    .returning(summaryColumns);
  if (!updated) {
    throw notFoundError("Endpoint de webhook não encontrado");
  }
  return updated;
}

/** The encrypted signing secret, for re-signing (test sends) or showing it again. */
export async function getWebhookEndpointSecret(
  database: Database,
  tenantId: string,
  endpointId: string,
): Promise<string> {
  const [row] = await database
    .select({ secretEnc: webhookEndpoints.secretEnc })
    .from(webhookEndpoints)
    .where(endpointCondition(tenantId, endpointId));
  if (!row) {
    throw notFoundError("Endpoint de webhook não encontrado");
  }
  return row.secretEnc;
}
