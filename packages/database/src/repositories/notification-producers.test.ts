import { randomUUID } from "node:crypto";
import { formatCents } from "@sellbridge/shared/money";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, notificationDeliveries, notificationPreferences } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets, markTargetFailed } from "./listings.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { markStoreStatus, upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let product: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let ownerA = "";
let ownerB = "";
let storeA = "";
const extraProducts: (() => Promise<void>)[] = [];

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 2);
  [ownerA = "", ownerB = ""] = users.ids;
  await database.insert(member).values([
    {
      id: randomUUID(),
      organizationId: tenants.tenantA,
      userId: ownerA,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      organizationId: tenants.tenantB,
      userId: ownerB,
      role: "owner",
      createdAt: new Date(),
    },
  ]);
  const store = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantA, `notice-${tenants.tenantA}`),
  );
  storeA = store.id;
  product = await createTestSupplierProduct(database, {
    sku: `NOTICE-${randomUUID()}`,
    title: "Fone sem fio",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await product.cleanup();
  await Promise.all(extraProducts.map(async (cleanup) => cleanup()));
  await database.$client.end();
});

async function emailsOf(userId: string, event: string) {
  return database
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, userId),
        eq(notificationDeliveries.event, event),
        eq(notificationDeliveries.channel, "email"),
      ),
    );
}

function paidOrder(orderedAt: Date) {
  return {
    externalOrderId: `ORD-${randomUUID()}`,
    status: "paid" as const,
    totalCents: 2500,
    marketplaceFeeCents: 300,
    buyerName: null,
    orderedAt,
    items: [
      { externalListingId: "EXT-X", title: "Fone sem fio", quantity: 1, unitPriceCents: 2500 },
    ],
  };
}

describe("sale paid", () => {
  it("e-mails the workspace's members once, with the amount and a link to the order", async () => {
    const order = paidOrder(new Date());
    const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeA, order);
    await upsertMarketplaceOrder(database, tenants.tenantA, storeA, { ...order, totalCents: 2600 });
    const emails = (await emailsOf(ownerA, "sale_paid")).filter(
      (row) => row.dedupeKey === `order:${orderId}:paid`,
    );
    expect(emails).toHaveLength(1);
    expect(emails[0]?.tenantId).toBe(tenants.tenantA);
    expect(emails[0]?.content).toMatchObject({
      subject: `Venda paga de ${formatCents(2500)}`,
      actionPath: `/pedidos/${orderId}`,
    });
    expect(await emailsOf(ownerB, "sale_paid")).toEqual([]);
  });

  it("does not e-mail old sales the first sync brings in", async () => {
    const order = paidOrder(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeA, order);
    const emails = await emailsOf(ownerA, "sale_paid");
    expect(emails.some((row) => row.dedupeKey === `order:${orderId}:paid`)).toBe(false);
  });

  it("respects a person who turned sale e-mails off", async () => {
    await database
      .insert(notificationPreferences)
      .values({ userId: ownerA, event: "sale_paid", channel: "email", enabled: false });
    const { orderId } = await upsertMarketplaceOrder(
      database,
      tenants.tenantA,
      storeA,
      paidOrder(new Date()),
    );
    const emails = await emailsOf(ownerA, "sale_paid");
    expect(emails.some((row) => row.dedupeKey === `order:${orderId}:paid`)).toBe(false);
    await database
      .delete(notificationPreferences)
      .where(eq(notificationPreferences.userId, ownerA));
  });
});

describe("order delivered", () => {
  it("e-mails a delivery to a person who turned it on (off by default)", async () => {
    const order = paidOrder(new Date());
    await upsertMarketplaceOrder(database, tenants.tenantA, storeA, order);
    await database
      .insert(notificationPreferences)
      .values({ userId: ownerA, event: "order_delivered", channel: "email", enabled: true });
    const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeA, {
      ...order,
      status: "delivered",
    });
    const emails = await emailsOf(ownerA, "order_delivered");
    expect(emails.map((row) => row.dedupeKey)).toContain(`order:${orderId}:delivered`);
  });
});

describe("store expired", () => {
  it("e-mails the workspace when a connected store expires", async () => {
    const shopId = `expire-${randomUUID()}`;
    const store = await upsertStoreConnection(database, testStoreInput(tenants.tenantA, shopId));
    await markStoreStatus(database, {
      storeConnectionId: store.id,
      status: "expired",
      lastError: "token",
    });
    const emails = await emailsOf(ownerA, "store_expired");
    expect(emails.map((row) => row.content)).toContainEqual(
      expect.objectContaining({ subject: `Loja ${shopId} precisa ser reconectada` }),
    );
  });
});

async function createTarget() {
  const extra = await createTestSupplierProduct(database, {
    sku: `NOTICE-${randomUUID()}`,
    title: "Fone recusado",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  extraProducts.push(extra.cleanup);
  const created = await createListingWithTargets(
    database,
    tenants.tenantA,
    {
      supplierProductId: extra.productId,
      title: `Fone recusado ${randomUUID().slice(0, 4)}`,
      description: "Descrição",
      priceCents: 3990,
    },
    [storeA],
  );
  const [targetId] = created.targetIds;
  if (targetId === undefined) {
    throw new Error("destino não criado");
  }
  return targetId;
}

describe("listing failed", () => {
  it("e-mails only when the last attempt fails", async () => {
    const retrying = await createTarget();
    await markTargetFailed(database, retrying, "Categoria inválida", { final: false });
    const failing = await createTarget();
    await markTargetFailed(database, failing, "Categoria inválida", { final: true });
    const keys = (await emailsOf(ownerA, "listing_failed")).map((row) => row.dedupeKey);
    expect(keys.some((key) => key.startsWith(`listing-target:${retrying}:`))).toBe(false);
    expect(keys.some((key) => key.startsWith(`listing-target:${failing}:`))).toBe(true);
  });
});
