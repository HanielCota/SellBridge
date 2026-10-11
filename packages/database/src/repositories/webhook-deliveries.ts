import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { apiEvents, webhookDeliveries, webhookEndpoints } from "../schema/index.ts";

/** A delivery the worker must send now, with everything needed to build the request. */
export interface DueWebhookDelivery {
  id: string;
  tenantId: string;
  /** Attempts already made before this one. */
  attempts: number;
  event: { id: string; sequence: number; type: string; data: unknown; createdAt: Date };
  endpoint: { id: string; url: string; secretEnc: string };
}

/**
 * Takes up to `limit` due deliveries of every tenant and leases them: `next_attempt_at` moves
 * `leaseMilliseconds` ahead, so another worker (or this one after a crash) only picks them up
 * again if the attempt never gets recorded. `SKIP LOCKED` keeps concurrent workers from
 * claiming the same rows. Deliveries of disabled endpoints wait until they are enabled.
 */
export interface WebhookDeliveryClaim {
  now: Date;
  limit: number;
  leaseMilliseconds: number;
  /** Only this organization's deliveries (tests, manual re-drives); every tenant when absent. */
  tenantId?: string | undefined;
}

export async function claimDueWebhookDeliveries(
  database: Database,
  claim: WebhookDeliveryClaim,
): Promise<DueWebhookDelivery[]> {
  return database.transaction(async (transaction) => {
    const due = await transaction
      .select({
        id: webhookDeliveries.id,
        tenantId: webhookDeliveries.tenantId,
        attempts: webhookDeliveries.attempts,
        event: {
          id: apiEvents.id,
          sequence: apiEvents.sequence,
          type: apiEvents.type,
          data: apiEvents.data,
          createdAt: apiEvents.createdAt,
        },
        endpoint: {
          id: webhookEndpoints.id,
          url: webhookEndpoints.url,
          secretEnc: webhookEndpoints.secretEnc,
        },
      })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .innerJoin(apiEvents, eq(apiEvents.id, webhookDeliveries.eventId))
      .where(
        and(
          eq(webhookDeliveries.status, "pending"),
          lte(webhookDeliveries.nextAttemptAt, claim.now),
          isNull(webhookEndpoints.disabledAt),
          claim.tenantId === undefined ? undefined : eq(webhookDeliveries.tenantId, claim.tenantId),
        ),
      )
      .orderBy(asc(webhookDeliveries.nextAttemptAt))
      .limit(claim.limit)
      .for("update", { of: webhookDeliveries, skipLocked: true });
    if (due.length === 0) {
      return [];
    }
    await transaction
      .update(webhookDeliveries)
      .set({ nextAttemptAt: new Date(claim.now.getTime() + claim.leaseMilliseconds) })
      .where(
        inArray(
          webhookDeliveries.id,
          due.map((delivery) => delivery.id),
        ),
      );
    return due;
  });
}

/**
 * Outcomes only apply to a delivery still pending: if a lease ever expired mid-request and
 * another run already settled it, the late result must not count a second attempt.
 */
function stillPending(deliveryId: string) {
  return and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.status, "pending"));
}

/** Long receiver error pages are not worth storing: the start says what went wrong. */
const MAX_ERROR_LENGTH = 500;

export async function markWebhookDelivered(
  database: Database,
  deliveryId: string,
  result: { statusCode: number; now: Date },
): Promise<void> {
  await database
    .update(webhookDeliveries)
    .set({
      status: "succeeded",
      attempts: sql`${webhookDeliveries.attempts} + 1`,
      lastStatusCode: result.statusCode,
      lastError: null,
      deliveredAt: result.now,
    })
    .where(stillPending(deliveryId));
}

/**
 * Records a failed attempt. `nextAttemptAt` is when to try again (the worker owns the backoff
 * schedule); null means attempts ran out and the delivery is final ("failed").
 */
export async function markWebhookAttemptFailed(
  database: Database,
  deliveryId: string,
  failure: { statusCode: number | null; error: string; nextAttemptAt: Date | null },
): Promise<void> {
  const retry = failure.nextAttemptAt === null ? {} : { nextAttemptAt: failure.nextAttemptAt };
  await database
    .update(webhookDeliveries)
    .set({
      ...retry,
      status: failure.nextAttemptAt === null ? "failed" : "pending",
      attempts: sql`${webhookDeliveries.attempts} + 1`,
      lastStatusCode: failure.statusCode,
      lastError: failure.error.slice(0, MAX_ERROR_LENGTH),
    })
    .where(stillPending(deliveryId));
}

export interface WebhookDeliverySummary {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: Date;
  deliveredAt: Date | null;
  createdAt: Date;
}

/** Most recent deliveries of one endpoint of the tenant, newest first. */
export async function listWebhookDeliveries(
  database: Database,
  tenantId: string,
  query: { endpointId: string; limit: number },
): Promise<WebhookDeliverySummary[]> {
  return database
    .select({
      id: webhookDeliveries.id,
      eventId: webhookDeliveries.eventId,
      eventType: apiEvents.type,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      lastStatusCode: webhookDeliveries.lastStatusCode,
      lastError: webhookDeliveries.lastError,
      nextAttemptAt: webhookDeliveries.nextAttemptAt,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .innerJoin(apiEvents, eq(apiEvents.id, webhookDeliveries.eventId))
    .where(
      and(
        eq(webhookDeliveries.tenantId, tenantId),
        eq(webhookDeliveries.endpointId, query.endpointId),
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(query.limit);
}
