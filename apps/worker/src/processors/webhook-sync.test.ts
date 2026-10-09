import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase, schema } from "@sellbridge/db";
import {
  createListingWithTargets,
  markTargetPublished,
  recordWebhookEvent,
} from "@sellbridge/db/repositories";
import {
  createConnectorRegistry,
  createTokenCipher,
  encodeMockAuthorizationCode,
  encodeMockOrderResource,
} from "@sellbridge/marketplaces";
import { loadRootEnv } from "@sellbridge/shared/env-node";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStockPriceSyncProcessor } from "./stock-price-sync.ts";
import { createWebhookEventProcessor } from "./webhook-event.ts";

loadRootEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL é obrigatória para os testes do worker");
}
const db = createDatabase(databaseUrl, { maxConnections: 2 });
const cipher = createTokenCipher(randomBytes(32).toString("base64"));
const connectors = createConnectorRegistry({
  appUrl: "http://localhost:3000",
  mockWebhookSecret: "segredo-de-teste-123",
  mockLatencyMs: 0,
});
const processWebhook = createWebhookEventProcessor({ db, connectors, cipher });

const tenantId = randomUUID();
let supplierId = "";
let storeId = "";
let shopId = "";
let targetId = "";
const eventIds: string[] = [];

async function recordEvent(payload: Record<string, unknown>, topic = "orders"): Promise<string> {
  const result = await recordWebhookEvent(db, {
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

beforeAll(async () => {
  await db.insert(schema.organization).values({
    id: tenantId,
    name: "Tenant webhook",
    slug: `wh-${tenantId}`,
    createdAt: new Date(),
  });
  const [supplier] = await db
    .insert(schema.suppliers)
    .values({ name: "Fornecedor webhook", niche: "Teste", state: "ZZ", city: "X" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor");
  }
  supplierId = supplier.id;
  const [product] = await db
    .insert(schema.supplierProducts)
    .values({
      supplierId,
      sku: "WH-1",
      title: "Produto webhook",
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 5,
    })
    .returning();
  if (!product) {
    throw new Error("produto");
  }
  const { tokens, shop } = await connectors.mock.exchangeCode({
    code: encodeMockAuthorizationCode("Loja webhook"),
    redirectUri: "http://localhost:3000/cb",
  });
  shopId = shop.externalShopId;
  const [store] = await db
    .insert(schema.storeConnections)
    .values({
      tenantId,
      marketplace: "mock",
      externalShopId: shop.externalShopId,
      shopName: shop.shopName,
      accessTokenEnc: cipher.encrypt(tokens.accessToken),
      status: "connected",
    })
    .returning();
  if (!store) {
    throw new Error("loja");
  }
  storeId = store.id;
  const created = await createListingWithTargets(
    db,
    tenantId,
    {
      supplierProductId: product.id,
      title: "Anúncio webhook",
      description: "Descrição",
      priceCents: 4990,
    },
    [storeId],
  );
  targetId = created.targetIds[0] ?? "";
  await markTargetPublished(db, targetId, { externalId: "MOCK-ITEM-WH", externalUrl: null });
});

afterAll(async () => {
  await db.delete(schema.webhookEvents).where(inArray(schema.webhookEvents.id, eventIds));
  await db.delete(schema.organization).where(eq(schema.organization.id, tenantId));
  await db.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
  await db.$client.end();
});

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

    const rows = await db
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
    const row = await db.query.webhookEvents.findFirst({
      where: eq(schema.webhookEvents.id, eventId),
    });
    expect(row).toMatchObject({ processedAt: null, error: "Pedido simulado em formato inválido" });
  });
});

describe("stock-price-sync processor", () => {
  it("pushes changed stock and price and marks the target as synced", async () => {
    const sync = createStockPriceSyncProcessor({
      db,
      connectors,
      cipher,
      acquireRateLimit: async () => {},
    });
    const summary = await sync();
    expect(summary.synced).toBeGreaterThanOrEqual(1);
    const row = await db.query.listingTargets.findFirst({
      where: eq(schema.listingTargets.id, targetId),
    });
    expect(row).toMatchObject({ syncedStock: 5, syncedPriceCents: 4990 });
    expect(row?.syncedAt).not.toBeNull();
  });
});
