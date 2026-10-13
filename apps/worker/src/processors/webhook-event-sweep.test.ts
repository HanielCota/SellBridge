import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { recordWebhookEvent } from "@sellbridge/database/repositories";
import { encodeMockOrderResource } from "@sellbridge/marketplaces";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createWebhookEventProcessor } from "./webhook-event.ts";
import { createWebhookEventSweepProcessor } from "./webhook-event-sweep.ts";

const environment = createWorkerTestEnvironment();
const { database, connectors } = environment;

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let shopId = "";
const eventIds: string[] = [];

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  shopId = (await createTestStore(environment, tenants.first)).externalShopId;
});

afterAll(async () => {
  await database.delete(schema.webhookEvents).where(inArray(schema.webhookEvents.id, eventIds));
  await tenants.cleanup();
  await database.$client.end();
});

async function recordOrderEvent(): Promise<string> {
  const resource = encodeMockOrderResource({
    externalOrderId: `SIM-${randomUUID()}`,
    status: "paid",
    totalCents: 4990,
    marketplaceFeeCents: 700,
    buyerName: "Comprador",
    orderedAt: new Date().toISOString(),
    items: [
      { externalListingId: "MOCK-ITEM-SWEEP", title: "Item", quantity: 1, unitPriceCents: 4990 },
    ],
  });
  const result = await recordWebhookEvent(database, {
    marketplace: "mock",
    externalEventId: randomUUID(),
    topic: "orders",
    rawPayload: { shopId, resource },
    signatureValid: true,
  });
  if (result.status !== "created") {
    throw new Error("evento não criado");
  }
  eventIds.push(result.id);
  return result.id;
}

/** The sweeper does not care about the stock sync; the webhook processor needs one anyway. */
const requestStockSync = async () => {};

describe("webhook event sweeper", () => {
  it("creates the order once the marketplace recovers from the failed retries", async () => {
    const outage = createWebhookEventProcessor({
      ...environment,
      requestStockSync,
      connectors: {
        ...connectors,
        mock: {
          ...connectors.mock,
          fetchOrder: async () => {
            throw new Error("API de pedidos indisponível");
          },
        },
      },
    });
    const webhookEventId = await recordOrderEvent();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        outage({ data: { webhookEventId }, attemptsMade: attempt, maxAttempts: 5 }),
      ).rejects.toThrow("indisponível");
    }

    const processWebhook = createWebhookEventProcessor({ ...environment, requestStockSync });
    const sweep = createWebhookEventSweepProcessor({
      database,
      now: () => new Date(Date.now() + 15 * 60 * 1000),
      enqueue: async (id) => {
        await processWebhook({ data: { webhookEventId: id }, attemptsMade: 0, maxAttempts: 8 });
      },
    });
    await sweep();

    const event = await database.query.webhookEvents.findFirst({
      where: eq(schema.webhookEvents.id, webhookEventId),
    });
    expect(event?.processedAt).not.toBeNull();
    const orders = await database.query.orders.findMany({
      where: eq(schema.orders.tenantId, tenants.first),
    });
    expect(orders).toHaveLength(1);
  });

  it("skips events still inside the grace period", async () => {
    const webhookEventId = await recordOrderEvent();
    const enqueued: string[] = [];
    const sweep = createWebhookEventSweepProcessor({
      database,
      enqueue: async (id) => {
        enqueued.push(id);
      },
    });
    await sweep();
    expect(enqueued).not.toContain(webhookEventId);
  });
});
