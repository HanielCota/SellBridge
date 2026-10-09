import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { recordWebhookEvent } from "@sellbridge/database/repositories";
import { encodeMockOrderResource } from "@sellbridge/marketplaces";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublishedTestTarget,
  createTestProduct,
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createWebhookEventProcessor } from "./webhook-event.ts";

const environment = createWorkerTestEnvironment();
const { database } = environment;
const processWebhook = createWebhookEventProcessor(environment);

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let tenantId = "";
let shopId = "";
let targetId = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.first;
  catalog = await createTestProduct(database, { sku: "WH-1", title: "Produto webhook", stock: 5 });
  const store = await createTestStore(environment, tenantId);
  shopId = store.externalShopId;
  targetId = await createPublishedTestTarget(database, {
    tenantId,
    productId: catalog.productId,
    storeId: store.id,
    title: "Anúncio webhook",
    externalId: "MOCK-ITEM-WH",
  });
});

afterAll(async () => {
  await database.delete(schema.webhookEvents).where(inArray(schema.webhookEvents.id, eventIds));
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});
const eventIds: string[] = [];

async function recordEvent(payload: Record<string, unknown>, topic = "orders"): Promise<string> {
  const result = await recordWebhookEvent(database, {
    marketplace: "mock",
    externalEventId: randomUUID(),
    topic,
    rawPayload: payload,
    signatureValid: true,
  });
  if (result.status !== "created") {
    throw new Error("evento não criado");
  }
  eventIds.push(result.id);
  return result.id;
}

function job(webhookEventId: string) {
  return { data: { webhookEventId }, attemptsMade: 0, maxAttempts: 5 };
}

const orderResource = () =>
  encodeMockOrderResource({
    externalOrderId: `SIM-${randomUUID()}`,
    status: "paid",
    totalCents: 4990,
    marketplaceFeeCents: 700,
    buyerName: "Comprador",
    orderedAt: new Date().toISOString(),
    items: [
      {
        externalListingId: "MOCK-ITEM-WH",
        title: "Anúncio webhook",
        quantity: 1,
        unitPriceCents: 4990,
      },
    ],
  });

describe("webhook-event processor", () => {
  it("fetches the order, stores it with our cost and is idempotent", async () => {
    const eventId = await recordEvent({ shopId, resource: orderResource() });
    expect(await processWebhook(job(eventId))).toBe("order_created");
    expect(await processWebhook(job(eventId))).toBe("already_processed");

    const rows = await database
      .select({ cost: schema.orderItems.unitCostCents, target: schema.orderItems.listingTargetId })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.tenantId, tenantId));
    expect(rows).toEqual([{ cost: 2000, target: targetId }]);
  });

  it("ignores other topics and events from unknown shops", async () => {
    expect(
      await processWebhook(job(await recordEvent({ shopId, resource: "x" }, "questions"))),
    ).toBe("ignored_topic");
    expect(
      await processWebhook(job(await recordEvent({ shopId: "loja-desconhecida", resource: "x" }))),
    ).toBe("unknown_store");
  });

  it("keeps the event pending with the error when the resource is invalid", async () => {
    const eventId = await recordEvent({ shopId, resource: "mock-order.invalido" });
    await expect(processWebhook(job(eventId))).rejects.toThrow(
      "Pedido simulado em formato inválido",
    );
    const row = await database.query.webhookEvents.findFirst({
      where: eq(schema.webhookEvents.id, eventId),
    });
    expect(row).toMatchObject({ processedAt: null, error: "Pedido simulado em formato inválido" });
  });
});
