import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiIdempotencyKeys, webhookDeliveries } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair } from "../testing/fixtures.ts";
import { pruneIdempotencyKeys } from "./api-idempotency.ts";
import { recordApiEvent } from "./api-events.ts";
import {
  claimDueWebhookDeliveries,
  listWebhookDeliveries,
  markWebhookAttemptFailed,
  markWebhookDelivered,
} from "./webhook-deliveries.ts";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  getWebhookEndpointSecret,
  listWebhookEndpoints,
  setWebhookEndpointDisabled,
} from "./webhook-endpoints.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let tenantA = "";
let tenantB = "";

/**
 * Deliveries of these tests are moved to a far future and claimed "then", scoped to the
 * tenant, so the worker tests (claiming every tenant at the real time) never see them.
 */
const FUTURE = new Date("2100-01-01T00:00:00Z");
const LEASE = 60_000;

const orderData = {
  orderId: "00000000-0000-4000-8000-000000000001",
  externalOrderId: "ORD-WH",
  storeId: "00000000-0000-4000-8000-000000000002",
  status: "paid",
  previousStatus: null,
  totalCents: 1000,
  orderedAt: "2026-01-01T00:00:00.000Z",
};

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

async function postponeDeliveries(endpointId: string): Promise<void> {
  await database
    .update(webhookDeliveries)
    .set({ nextAttemptAt: FUTURE })
    .where(eq(webhookDeliveries.endpointId, endpointId));
}

function claimForTenant(tenantId: string, now = FUTURE) {
  return claimDueWebhookDeliveries(database, {
    now,
    limit: 10,
    leaseMilliseconds: LEASE,
    tenantId,
  });
}

describe("webhook endpoints", () => {
  it("are tenant-scoped and never expose the secret in summaries", async () => {
    const endpoint = await createWebhookEndpoint(database, tenantA, {
      url: "https://example.com/hooks",
      description: "ERP",
      eventTypes: ["order.created"],
      secretEnc: "cifrado",
    });
    expect(endpoint).not.toHaveProperty("secretEnc");
    expect((await listWebhookEndpoints(database, tenantA)).map((item) => item.id)).toContain(
      endpoint.id,
    );
    expect(await listWebhookEndpoints(database, tenantB)).toEqual([]);
    await expect(getWebhookEndpoint(database, tenantB, endpoint.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await getWebhookEndpointSecret(database, tenantA, endpoint.id)).toBe("cifrado");

    const disabled = await setWebhookEndpointDisabled(database, {
      tenantId: tenantA,
      endpointId: endpoint.id,
      disabled: true,
    });
    expect(disabled.disabledAt).not.toBeNull();

    await expect(deleteWebhookEndpoint(database, tenantB, endpoint.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await deleteWebhookEndpoint(database, tenantA, endpoint.id);
    expect(await listWebhookEndpoints(database, tenantA)).toEqual([]);
  });
});

describe("webhook deliveries", () => {
  it("queues subscribed endpoints, leases claims and records the outcome", async () => {
    const subscribed = await createWebhookEndpoint(database, tenantA, {
      url: "https://example.com/orders",
      description: null,
      eventTypes: ["order.created"],
      secretEnc: "cifrado",
    });
    const other = await createWebhookEndpoint(database, tenantA, {
      url: "https://example.com/listings",
      description: null,
      eventTypes: ["listing.published"],
      secretEnc: "cifrado",
    });
    const eventId = await recordApiEvent(database, {
      tenantId: tenantA,
      type: "order.created",
      data: orderData,
    });
    await postponeDeliveries(subscribed.id);
    await postponeDeliveries(other.id);

    const claimed = await claimForTenant(tenantA);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      tenantId: tenantA,
      attempts: 0,
      event: { id: eventId, type: "order.created", data: orderData },
      endpoint: { id: subscribed.id, url: "https://example.com/orders", secretEnc: "cifrado" },
    });
    expect(await claimForTenant(tenantA)).toEqual([]);
    expect(await claimForTenant(tenantB)).toEqual([]);

    const deliveryId = claimed[0]?.id ?? "";
    await markWebhookAttemptFailed(database, deliveryId, {
      statusCode: 500,
      error: "x".repeat(2000),
      nextAttemptAt: FUTURE,
    });
    const retried = await claimForTenant(tenantA, new Date(FUTURE.getTime() + LEASE));
    expect(retried.map((delivery) => delivery.attempts)).toEqual([1]);

    await markWebhookDelivered(database, deliveryId, { statusCode: 204, now: FUTURE });
    const [delivery] = await listWebhookDeliveries(database, tenantA, {
      endpointId: subscribed.id,
      limit: 10,
    });
    expect(delivery).toMatchObject({
      id: deliveryId,
      eventType: "order.created",
      status: "succeeded",
      attempts: 2,
      lastStatusCode: 204,
      lastError: null,
    });
    expect(
      await listWebhookDeliveries(database, tenantB, { endpointId: subscribed.id, limit: 10 }),
    ).toEqual([]);
  });

  it("gives up when no retry is scheduled and skips disabled endpoints", async () => {
    const endpoint = await createWebhookEndpoint(database, tenantB, {
      url: "https://example.com/all",
      description: null,
      eventTypes: [],
      secretEnc: "cifrado",
    });
    await recordApiEvent(database, { tenantId: tenantB, type: "order.created", data: orderData });
    await recordApiEvent(database, {
      tenantId: tenantB,
      type: "order.status_changed",
      data: { ...orderData, status: "shipped", previousStatus: "paid" },
    });
    await postponeDeliveries(endpoint.id);

    await setWebhookEndpointDisabled(database, {
      tenantId: tenantB,
      endpointId: endpoint.id,
      disabled: true,
    });
    expect(await claimForTenant(tenantB)).toEqual([]);
    await setWebhookEndpointDisabled(database, {
      tenantId: tenantB,
      endpointId: endpoint.id,
      disabled: false,
    });

    const claimed = await claimForTenant(tenantB);
    expect(claimed.map((delivery) => delivery.event.type).toSorted()).toEqual([
      "order.created",
      "order.status_changed",
    ]);
    for (const delivery of claimed) {
      await markWebhookAttemptFailed(database, delivery.id, {
        statusCode: null,
        error: "timeout",
        nextAttemptAt: null,
      });
    }
    const deliveries = await listWebhookDeliveries(database, tenantB, {
      endpointId: endpoint.id,
      limit: 10,
    });
    expect(deliveries.map((delivery) => delivery.status)).toEqual(["failed", "failed"]);
    expect(await claimForTenant(tenantB, new Date(FUTURE.getTime() + 10 * LEASE))).toEqual([]);
  });
});

describe("idempotency key pruning", () => {
  it("drops only keys created before the cutoff", async () => {
    await database.insert(apiIdempotencyKeys).values([
      { tenantId: tenantA, key: "velha", requestHash: "h", createdAt: new Date("2000-01-01") },
      { tenantId: tenantA, key: "nova", requestHash: "h" },
    ]);
    expect(await pruneIdempotencyKeys(database, new Date("2001-01-01"))).toBeGreaterThanOrEqual(1);
    const remaining = await database
      .select({ key: apiIdempotencyKeys.key })
      .from(apiIdempotencyKeys)
      .where(
        and(
          eq(apiIdempotencyKeys.tenantId, tenantA),
          inArray(apiIdempotencyKeys.key, ["velha", "nova"]),
        ),
      );
    expect(remaining.map((row) => row.key)).toEqual(["nova"]);
  });
});
