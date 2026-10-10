import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webhookEvents } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import { findConnectedStoreByShop, recordWebhookEvent } from "./webhooks.ts";

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
    expect(second.status).toBe("duplicate");
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
