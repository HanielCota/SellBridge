import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import { apiIdempotencyKeys } from "../schema/index.ts";

/** Long enough for any client retry loop; afterwards the same key starts a new request. */
export const IDEMPOTENCY_KEY_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;
/** A request still "in progress" after this died midway (deploy, crash): its key is freed. */
export const IDEMPOTENCY_ABANDONED_AFTER_MILLISECONDS = 5 * 60 * 1000;

export type IdempotencyReservation =
  | { status: "reserved" }
  | { status: "replay"; responseStatus: number; responseBody: unknown }
  | { status: "in_progress" }
  | { status: "mismatch" };

interface IdempotencyKey {
  tenantId: string;
  key: string;
}

function keyCondition(target: IdempotencyKey) {
  return and(
    eq(apiIdempotencyKeys.tenantId, target.tenantId),
    eq(apiIdempotencyKeys.key, target.key),
  );
}

/**
 * Claims the key for this request. A key already used returns the stored response (same
 * request), "in_progress" (first request still running) or "mismatch" (a different request
 * reusing the key, which is a client bug).
 */
export async function reserveIdempotencyKey(
  database: Database,
  target: IdempotencyKey & { requestHash: string; now: Date },
): Promise<IdempotencyReservation> {
  const expiredBefore = new Date(target.now.getTime() - IDEMPOTENCY_KEY_TTL_MILLISECONDS);
  const abandonedBefore = new Date(target.now.getTime() - IDEMPOTENCY_ABANDONED_AFTER_MILLISECONDS);
  await database
    .delete(apiIdempotencyKeys)
    .where(
      and(
        keyCondition(target),
        or(
          lt(apiIdempotencyKeys.createdAt, expiredBefore),
          and(
            isNull(apiIdempotencyKeys.responseStatus),
            lt(apiIdempotencyKeys.createdAt, abandonedBefore),
          ),
        ),
      ),
    );
  const inserted = await database
    .insert(apiIdempotencyKeys)
    .values({ tenantId: target.tenantId, key: target.key, requestHash: target.requestHash })
    .onConflictDoNothing()
    .returning({ key: apiIdempotencyKeys.key });
  if (inserted.length > 0) {
    return { status: "reserved" };
  }
  const [existing] = await database.select().from(apiIdempotencyKeys).where(keyCondition(target));
  if (!existing || existing.requestHash !== target.requestHash) {
    return { status: "mismatch" };
  }
  if (existing.responseStatus === null) {
    return { status: "in_progress" };
  }
  return {
    status: "replay",
    responseStatus: existing.responseStatus,
    responseBody: existing.responseBody,
  };
}

export async function completeIdempotencyKey(
  database: Database,
  target: IdempotencyKey & { responseStatus: number; responseBody: unknown },
): Promise<void> {
  await database
    .update(apiIdempotencyKeys)
    .set({ responseStatus: target.responseStatus, responseBody: target.responseBody })
    .where(keyCondition(target));
}

/** Drops keys past their lifetime (every tenant); run by the worker, not on each request. */
export async function pruneIdempotencyKeys(database: Database, before: Date): Promise<number> {
  const deleted = await database
    .delete(apiIdempotencyKeys)
    .where(lt(apiIdempotencyKeys.createdAt, before))
    .returning({ key: apiIdempotencyKeys.key });
  return deleted.length;
}
