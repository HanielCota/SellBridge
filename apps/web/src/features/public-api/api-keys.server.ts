import {
  type ApiKeySummary,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "@sellbridge/database/repositories";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { generateApiKeySecret } from "./api-key-secret.server";
import {
  apiKeyStatus,
  type ApiKeyView,
  type CreateApiKeyRequest,
  MAX_ACTIVE_API_KEYS,
} from "./api-keys";

export interface IssuedApiKey {
  key: ApiKeySummary;
  /** The full key, returned only here: it is never stored and cannot be shown again. */
  secret: string;
}

export async function listOrganizationApiKeys(tenantId: string): Promise<ApiKeyView[]> {
  const keys = await listApiKeys(database, tenantId);
  const now = new Date();
  return keys.map((key) => ({ ...key, status: apiKeyStatus(key, now) }));
}

function futureExpiration(expiresAt: string | null, now: Date): Date | null {
  if (expiresAt === null) {
    return null;
  }
  const date = new Date(expiresAt);
  if (date.getTime() <= now.getTime()) {
    throw validationError("A data de expiração precisa estar no futuro");
  }
  return date;
}

/**
 * The count is read before the insert, so two simultaneous creations could pass the cap by one;
 * the cap only keeps forgotten keys from piling up, so that is acceptable.
 */
async function assertBelowActiveKeyLimit(tenantId: string, now: Date): Promise<void> {
  const keys = await listApiKeys(database, tenantId);
  const activeCount = keys.filter((key) => apiKeyStatus(key, now) === "active").length;
  if (activeCount >= MAX_ACTIVE_API_KEYS) {
    throw conflictError(
      `Sua organização já tem ${MAX_ACTIVE_API_KEYS} chaves ativas. Revogue as que não usa antes de criar outra.`,
    );
  }
}

export async function issueApiKey(input: {
  tenantId: string;
  userId: string;
  request: CreateApiKeyRequest;
}): Promise<IssuedApiKey> {
  const now = new Date();
  const expiresAt = futureExpiration(input.request.expiresAt, now);
  await assertBelowActiveKeyLimit(input.tenantId, now);
  const generated = generateApiKeySecret();
  const key = await createApiKey(database, {
    tenantId: input.tenantId,
    name: input.request.name,
    prefix: generated.prefix,
    secretHash: generated.secretHash,
    scopes: input.request.scopes,
    createdByUserId: input.userId,
    expiresAt,
  });
  logger.info("api_key.created", {
    tenantId: input.tenantId,
    userId: input.userId,
    apiKeyId: key.id,
    keyPrefix: key.prefix,
    scopes: key.scopes,
  });
  return { key, secret: generated.secret };
}

export async function revokeOrganizationApiKey(input: {
  tenantId: string;
  userId: string;
  apiKeyId: string;
}): Promise<void> {
  await revokeApiKey(database, input.tenantId, input.apiKeyId);
  logger.info("api_key.revoked", {
    tenantId: input.tenantId,
    userId: input.userId,
    apiKeyId: input.apiKeyId,
  });
}
