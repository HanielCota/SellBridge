import { notFoundError } from "@sellbridge/shared/errors";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { apiKeys, apiRateLimits, organization } from "../schema/index.ts";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const summaryColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  scopes: apiKeys.scopes,
  lastUsedAt: apiKeys.lastUsedAt,
  expiresAt: apiKeys.expiresAt,
  revokedAt: apiKeys.revokedAt,
  createdAt: apiKeys.createdAt,
};

export interface NewApiKey {
  tenantId: string;
  name: string;
  prefix: string;
  secretHash: string;
  scopes: readonly string[];
  createdByUserId: string | null;
  expiresAt: Date | null;
}

export async function createApiKey(
  database: DatabaseExecutor,
  key: NewApiKey,
): Promise<ApiKeySummary> {
  const [created] = await database
    .insert(apiKeys)
    .values({ ...key, scopes: [...key.scopes] })
    .returning(summaryColumns);
  if (!created) {
    throw new Error("Não foi possível gravar a chave de API");
  }
  return created;
}

/** Newest first, revoked keys included so the page can show what was turned off. */
export async function listApiKeys(
  database: DatabaseExecutor,
  tenantId: string,
): Promise<ApiKeySummary[]> {
  return database
    .select(summaryColumns)
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(
  database: Database,
  tenantId: string,
  id: string,
): Promise<void> {
  const revoked = await database
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (revoked.length === 0) {
    throw notFoundError("Chave de API não encontrada");
  }
}

export interface ActiveApiKey {
  id: string;
  tenantId: string;
  scopes: string[];
}

/** The key behind a secret, only while it is neither revoked nor expired. */
export async function findActiveApiKey(
  database: Database,
  secretHash: string,
  now: Date,
): Promise<ActiveApiKey | null> {
  const [found] = await database
    .select({ id: apiKeys.id, tenantId: apiKeys.tenantId, scopes: apiKeys.scopes })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.secretHash, secretHash),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), sql`${apiKeys.expiresAt} > ${now.toISOString()}`),
      ),
    );
  return found ?? null;
}

const LAST_USED_PRECISION_MILLISECONDS = 60_000;

/** Records use at most once a minute per key, so busy integrations don't write on every call. */
export async function touchApiKey(database: Database, id: string, now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - LAST_USED_PRECISION_MILLISECONDS);
  await database
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(
      and(eq(apiKeys.id, id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, staleBefore))),
    );
}

/**
 * Counts one request in the key's current window and returns the total so far. Windows older
 * than the previous one are pruned along the way.
 */
export async function countApiRequest(
  database: Database,
  apiKeyId: string,
  windowStart: Date,
): Promise<number> {
  const [row] = await database
    .insert(apiRateLimits)
    .values({ apiKeyId, windowStart, requests: 1 })
    .onConflictDoUpdate({
      target: [apiRateLimits.apiKeyId, apiRateLimits.windowStart],
      set: { requests: sql`${apiRateLimits.requests} + 1` },
    })
    .returning({ requests: apiRateLimits.requests });
  await database
    .delete(apiRateLimits)
    .where(and(eq(apiRateLimits.apiKeyId, apiKeyId), lt(apiRateLimits.windowStart, windowStart)));
  return row?.requests ?? 1;
}

export interface ApiKeyIdentity {
  keyName: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  organizationId: string;
  organizationName: string;
}

/** The key and the organization it acts for, as the caller is told by `GET /me`. */
export async function getApiKeyIdentity(
  database: Database,
  apiKeyId: string,
): Promise<ApiKeyIdentity> {
  const [found] = await database
    .select({
      keyName: apiKeys.name,
      keyPrefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      organizationId: organization.id,
      organizationName: organization.name,
    })
    .from(apiKeys)
    .innerJoin(organization, eq(organization.id, apiKeys.tenantId))
    .where(eq(apiKeys.id, apiKeyId));
  if (!found) {
    throw notFoundError("Chave de API não encontrada");
  }
  return found;
}

/**
 * Revokes every key of the organization still in use (its owner was blocked): the public API
 * must stop answering for an account the platform shut out. Returns how many were revoked.
 */
export async function revokeTenantApiKeys(database: Database, tenantId: string): Promise<number> {
  const revoked = await database
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return revoked.length;
}
