import {
  createDeveloperApiKey,
  type DeveloperApiKeySummary,
  listDeveloperApiKeys,
  revokeDeveloperApiKey,
} from "@sellbridge/database/repositories";
import { conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { generateDeveloperKeySecret } from "./developer-key-secret.server";
import {
  type CreateDeveloperKeyRequest,
  developerKeyExpiration,
  developerKeyStatus,
  type DeveloperKeyView,
  MAX_ACTIVE_DEVELOPER_KEYS,
} from "./developer-keys";

export interface IssuedDeveloperKey {
  key: DeveloperApiKeySummary;
  /** The full key, returned only here: it is never stored and cannot be shown again. */
  secret: string;
}

export async function listOwnDeveloperKeys(userId: string, now: Date): Promise<DeveloperKeyView[]> {
  const keys = await listDeveloperApiKeys(database, userId);
  return keys.map((key) => ({ ...key, status: developerKeyStatus(key, now) }));
}

export async function issueDeveloperKey(input: {
  userId: string;
  request: CreateDeveloperKeyRequest;
  now: Date;
}): Promise<IssuedDeveloperKey> {
  const { userId, request, now } = input;
  const existing = await listOwnDeveloperKeys(userId, now);
  const active = existing.filter((key) => key.status === "active").length;
  if (active >= MAX_ACTIVE_DEVELOPER_KEYS) {
    throw conflictError(
      `Você já tem ${MAX_ACTIVE_DEVELOPER_KEYS} chaves ativas. Revogue uma que não usa mais para criar outra.`,
    );
  }
  const generated = generateDeveloperKeySecret();
  const key = await createDeveloperApiKey(database, {
    name: request.name,
    prefix: generated.prefix,
    secretHash: generated.secretHash,
    scopes: request.scopes,
    createdByUserId: userId,
    expiresAt: developerKeyExpiration(request.validity, now),
  });
  logger.info("developer_api.key_created", { developerApiKeyId: key.id, scopes: key.scopes });
  return { key, secret: generated.secret };
}

export async function revokeOwnDeveloperKey(input: {
  userId: string;
  developerApiKeyId: string;
  now: Date;
}): Promise<void> {
  await revokeDeveloperApiKey(database, input.userId, input.developerApiKeyId, input.now);
  logger.info("developer_api.key_revoked", { developerApiKeyId: input.developerApiKeyId });
}
