import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, orders, session, tickets, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { getCustomer, getWeeklyOrderCounts, listCustomerSignals } from "./customers.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const marker = randomUUID().slice(0, 8);
const userId = randomUUID();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantId = "";
const DAY = 86_400_000;

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.ids[0] ?? "";
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
    {
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `o3-${marker}`,
      status: "delivered",
      totalCents: 7_000,
      marketplaceFeeCents: 0,
      orderedAt: new Date(now.getTime() - 40 * DAY),
    },
  ]);
  await database.insert(tickets).values([
    { tenantId, createdById: userId, subject: "Aguardando", status: "open" },
    { tenantId, createdById: userId, subject: "Respondido", status: "answered" },
  ]);
  await database.insert(session).values([
    {
      id: randomUUID(),
      token: `own-${marker}`,
      userId,
      expiresAt: new Date(now.getTime() + DAY),
      createdAt: now,
      updatedAt: new Date(now.getTime() - 2 * DAY),
    },
    {
      id: randomUUID(),
      token: `admin-${marker}`,
      userId,
      impersonatedBy: randomUUID(),
      expiresAt: new Date(now.getTime() + DAY),
      createdAt: now,
      updatedAt: now,
    },
  ]);
});

afterAll(async () => {
  await database.delete(user).where(inArray(user.id, [userId]));
  await tenants.cleanup();
});

describe("customers", () => {
  it("finds the customer by name or e-mail with its activity", async () => {
    const customers = await listCustomerSignals(database, { search: marker });
    expect(customers).toHaveLength(1);
    const [customer] = customers;
    expect(customer).toMatchObject({
      id: userId,
      role: "user",
      banned: false,
      connectedStores: 1,
      recentOrders: 1,
      recentRevenueCents: 10_000,
    });
  });

  it("loads the signals behind the health score", async () => {
    const [customer] = await listCustomerSignals(database, { search: marker });
    expect(customer).toMatchObject({
      hasRegion: false,
      previousOrders: 1,
      waitingTickets: 1,
      stores: [{ marketplace: "mock", shopName: "Loja do cliente", status: "connected" }],
    });
    const lastSeen = customer?.lastSeenAt?.getTime() ?? 0;
    expect(Date.now() - lastSeen).toBeGreaterThan(DAY);
  });

  it("counts orders per week, oldest first", async () => {
    const weeks = await getWeeklyOrderCounts(database, tenantId, 8);
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toBe(1);
    expect(weeks.reduce((total, weekOrders) => total + weekOrders, 0)).toBe(2);
  });

  it("returns a single customer and null for unknown ids", async () => {
    expect((await getCustomer(database, userId))?.email).toBe(`cliente-${marker}@sellbridge.test`);
    expect(await getCustomer(database, randomUUID())).toBeNull();
  });
});
