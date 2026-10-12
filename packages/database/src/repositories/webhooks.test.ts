import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webhookEvents } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  findConnectedStoreByShop,
  findUnprocessedWebhookEvents,
  markWebhookProcessed,
  recordWebhookEvent,
} from "./webhooks.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let shopId = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantA = tenants.ids[0] ?? "";
  shopId = `shop-${tenantA}`;
  await upsertStoreConnection(database, testStoreInput(tenantA, shopId));
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("webhook events", () => {
  it("stores each external event once", async () => {
    const externalEventId = `evt-${randomUUID()}`;
    const input = {
      marketplace: "mock" as const,
      externalEventId,
      topic: "orders",
      rawPayload: { sample: 1 },
      signatureValid: true,
    };
    const first = await recordWebhookEvent(database, input);
    const second = await recordWebhookEvent(database, input);
    expect(first.status).toBe("created");
    if (first.status !== "created") {
      return;
    }
    expect(second).toEqual({ status: "duplicate", id: first.id, pending: true });

    await markWebhookProcessed(database, first.id);
    const third = await recordWebhookEvent(database, input);
    expect(third).toEqual({ status: "duplicate", id: first.id, pending: false });
    await database.delete(webhookEvents).where(eq(webhookEvents.externalEventId, externalEventId));
  });

  it("records invalid events as already processed for auditing", async () => {
    const result = await recordWebhookEvent(database, {
      marketplace: "mock",
      externalEventId: null,
      topic: null,
      rawPayload: null,
      signatureValid: false,
      error: "Assinatura inválida",
    });
    expect(result.status).toBe("created");
    if (result.status !== "created") {
      return;
    }
    const row = await database.query.webhookEvents.findFirst({
      where: eq(webhookEvents.id, result.id),
    });
    expect(row).toMatchObject({ signatureValid: false, error: "Assinatura inválida" });
    expect(row?.processedAt).not.toBeNull();
    await database.delete(webhookEvents).where(eq(webhookEvents.id, result.id));
  });

  it("finds the connected store for a shop across tenants", async () => {
    expect((await findConnectedStoreByShop(database, "mock", shopId))?.tenantId).toBe(tenantA);
    expect(await findConnectedStoreByShop(database, "mock", "shop-inexistente")).toBeNull();
  });
});

async function recordValidEvent(receivedAt: Date) {
  const externalEventId = `evt-${randomUUID()}`;
  const result = await recordWebhookEvent(database, {
    marketplace: "mock",
    externalEventId,
    topic: "orders",
    rawPayload: {},
    signatureValid: true,
  });
  if (result.status !== "created") {
    throw new Error("evento não criado");
  }
  await database.update(webhookEvents).set({ receivedAt }).where(eq(webhookEvents.id, result.id));
  return result.id;
}

describe("unprocessed webhook sweep", () => {
  it("finds valid unprocessed events inside the window, oldest first", async () => {
    const now = Date.now();
    const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);
    const older = await recordValidEvent(minutesAgo(50));
    const stale = await recordValidEvent(minutesAgo(30));
    const recent = await recordValidEvent(minutesAgo(1));
    const processed = await recordValidEvent(minutesAgo(40));
    const abandoned = await recordValidEvent(minutesAgo(3 * 24 * 60));
    await markWebhookProcessed(database, processed);

    const found = await findUnprocessedWebhookEvents(database, {
      receivedAfter: minutesAgo(24 * 60),
      receivedBefore: minutesAgo(10),
      limit: 10_000,
    });
    const ours = found.filter((id) => [older, stale, recent, processed, abandoned].includes(id));
    expect(ours).toEqual([older, stale]);

    await database
      .delete(webhookEvents)
      .where(inArray(webhookEvents.id, [older, stale, recent, processed, abandoned]));
  });
});
