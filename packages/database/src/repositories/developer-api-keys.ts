import { notFoundError } from "@sellbridge/shared/errors";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  developerApiKeys,
  developerApiRateLimits,
  developerApiRequests,
  user,
} from "../schema/index.ts";

export interface DeveloperApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

const summaryColumns = {
  id: developerApiKeys.id,
  name: developerApiKeys.name,
  prefix: developerApiKeys.prefix,
  scopes: developerApiKeys.scopes,
  lastUsedAt: developerApiKeys.lastUsedAt,
  expiresAt: developerApiKeys.expiresAt,
  revokedAt: developerApiKeys.revokedAt,
  createdAt: developerApiKeys.createdAt,
};

export interface NewDeveloperApiKey {
  name: string;
  prefix: string;
  secretHash: string;
  scopes: readonly string[];
  createdByUserId: string;
  expiresAt: Date;
}

export async function createDeveloperApiKey(
  database: DatabaseExecutor,
  key: NewDeveloperApiKey,
): Promise<DeveloperApiKeySummary> {
  const [created] = await database
    .insert(developerApiKeys)
    .values({ ...key, scopes: [...key.scopes] })
    .returning(summaryColumns);
  if (created === undefined) {
    throw new Error("Could not store the developer API key");
  }
  return created;
}

/** The developer's own keys, newest first, revoked ones included. */
export async function listDeveloperApiKeys(
  database: DatabaseExecutor,
  createdByUserId: string,
): Promise<DeveloperApiKeySummary[]> {
  return database
    .select(summaryColumns)
    .from(developerApiKeys)
    .where(eq(developerApiKeys.createdByUserId, createdByUserId))
    .orderBy(desc(developerApiKeys.createdAt));
}

/** Revokes one of the developer's own keys; someone else's key is reported as not found. */
export async function revokeDeveloperApiKey(
  database: Database,
  createdByUserId: string,
  id: string,
  now: Date,
): Promise<void> {
  const revoked = await database
    .update(developerApiKeys)
    .set({ revokedAt: now })
    .where(
      and(
        eq(developerApiKeys.id, id),
        eq(developerApiKeys.createdByUserId, createdByUserId),
        isNull(developerApiKeys.revokedAt),
      ),
    )
    .returning({ id: developerApiKeys.id });
  if (revoked.length === 0) {
    throw notFoundError("Chave de desenvolvedor não encontrada");
  }
}

export interface ActiveDeveloperApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date;
  creatorEmail: string;
  creatorEmailVerified: boolean;
  creatorBanned: boolean;
}

/**
 * The key behind a secret hash while it is neither revoked nor expired, with its creator's
 * account: the caller re-checks that the creator is still a developer on every request.
 */
export async function findActiveDeveloperApiKey(
  database: Database,
  secretHash: string,
  now: Date,
): Promise<ActiveDeveloperApiKey | null> {
  const [found] = await database
    .select({
      id: developerApiKeys.id,
      name: developerApiKeys.name,
      prefix: developerApiKeys.prefix,
      scopes: developerApiKeys.scopes,
      expiresAt: developerApiKeys.expiresAt,
      creatorEmail: user.email,
      creatorEmailVerified: user.emailVerified,
      creatorBanned: sql<boolean>`coalesce(${user.banned}, false)`,
    })
    .from(developerApiKeys)
    .innerJoin(user, eq(user.id, developerApiKeys.createdByUserId))
    .where(
      and(
        eq(developerApiKeys.secretHash, secretHash),
        isNull(developerApiKeys.revokedAt),
        gt(developerApiKeys.expiresAt, now),
      ),
    );
  return found ?? null;
}

const LAST_USED_PRECISION_MILLISECONDS = 60_000;

/** Records use at most once a minute per key. */
export async function touchDeveloperApiKey(
  database: Database,
  id: string,
  now: Date,
): Promise<void> {
  const staleBefore = new Date(now.getTime() - LAST_USED_PRECISION_MILLISECONDS);
  await database
    .update(developerApiKeys)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(developerApiKeys.id, id),
        or(isNull(developerApiKeys.lastUsedAt), lt(developerApiKeys.lastUsedAt, staleBefore)),
      ),
    );
}

/** Counts one request in the key's current window and returns the total so far. */
export async function countDeveloperApiRequest(
  database: Database,
  developerApiKeyId: string,
  windowStart: Date,
): Promise<number> {
  const [row] = await database
    .insert(developerApiRateLimits)
    .values({ developerApiKeyId, windowStart, requests: 1 })
    .onConflictDoUpdate({
      target: [developerApiRateLimits.developerApiKeyId, developerApiRateLimits.windowStart],
      set: { requests: sql`${developerApiRateLimits.requests} + 1` },
    })
    .returning({ requests: developerApiRateLimits.requests });
  await database
    .delete(developerApiRateLimits)
    .where(
      and(
        eq(developerApiRateLimits.developerApiKeyId, developerApiKeyId),
        lt(developerApiRateLimits.windowStart, windowStart),
      ),
    );
  return row?.requests ?? 1;
}

export interface DeveloperApiRequestRecord {
  developerApiKeyId: string;
  operation: string;
  status: number;
  durationMilliseconds: number;
}

export async function recordDeveloperApiRequest(
  database: Database,
  record: DeveloperApiRequestRecord,
): Promise<void> {
  await database.insert(developerApiRequests).values(record);
}
