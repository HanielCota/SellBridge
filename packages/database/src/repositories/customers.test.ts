import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, orders, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { getCustomer, listCustomers } from "./customers.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const marker = randomUUID().slice(0, 8);
const userId = randomUUID();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  const tenantId = tenants.ids[0] ?? "";
  const now = new Date();
  await database.insert(user).values({
    id: userId,
    name: `Cliente ${marker}`,
    email: `cliente-${marker}@sellbridge.test`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await database
    .insert(member)
    .values({ id: randomUUID(), organizationId: tenantId, userId, role: "owner", createdAt: now });
  const store = await upsertStoreConnection(database, {
    tenantId,
    marketplace: "mock",
    externalShopId: `shop-${marker}`,
    shopName: "Loja do cliente",
    accessTokenEnc: "enc",
    refreshTokenEnc: "enc",
    expiresAt: new Date(now.getTime() + 3_600_000),
  });
  await database.insert(orders).values([
    {
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `o1-${marker}`,
      status: "paid",
      totalCents: 10_000,
      marketplaceFeeCents: 0,
      orderedAt: now,
    },
    {
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `o2-${marker}`,
      status: "cancelled",
      totalCents: 5_000,
      marketplaceFeeCents: 0,
      orderedAt: now,
    },
  ]);
});

afterAll(async () => {
  await database.delete(user).where(inArray(user.id, [userId]));
  await tenants.cleanup();
});

describe("customers", () => {
  it("finds the customer by name or e-mail with its activity", async () => {
    const page = await listCustomers(database, { search: marker }, { page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    const [customer] = page.items;
    expect(customer).toMatchObject({
      id: userId,
      role: "user",
      banned: false,
      connectedStores: 1,
      recentOrders: 1,
      recentRevenueCents: 10_000,
    });
  });

  it("returns a single customer and null for unknown ids", async () => {
    expect((await getCustomer(database, userId))?.email).toBe(`cliente-${marker}@sellbridge.test`);
    expect(await getCustomer(database, randomUUID())).toBeNull();
  });
});
