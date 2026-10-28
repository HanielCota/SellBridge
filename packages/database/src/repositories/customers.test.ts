import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  member,
  orders,
  organization,
  session,
  storeConnections,
  tickets,
  user,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testCpf,
} from "../testing/fixtures.ts";
import { getCustomer, getWeeklyOrderCounts, listCustomerSignals } from "./customers.ts";
import { saveBillingHolder } from "./region.ts";
import { assignStoreSupplier } from "./store-suppliers.ts";
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
      hasHolder: false,
      hasSupplier: false,
      previousOrders: 1,
      waitingTickets: 1,
      stores: [
        {
          marketplace: "mock",
          shopName: "Loja do cliente",
          status: "connected",
          supplierName: null,
        },
      ],
    });
    const lastSeen = customer?.lastSeenAt?.getTime() ?? 0;
    expect(Date.now() - lastSeen).toBeGreaterThan(DAY);
  });

  it("shows the shop's supplier and filters customers by it", async () => {
    const catalog = await createTestSupplierProduct(database, {
      sku: `CUS-${marker}`,
      title: "Produto do cliente",
      costCents: 1000,
      suggestedPriceCents: 2000,
    });
    try {
      const [before] = await listCustomerSignals(database, { search: marker });
      const storeName = before?.stores[0]?.shopName ?? "";
      const [store] = await database
        .select({ id: storeConnections.id })
        .from(storeConnections)
        .where(eq(storeConnections.tenantId, tenantId));
      await assignStoreSupplier(database, {
        tenantId,
        storeConnectionId: store?.id ?? "",
        supplierId: catalog.supplierId,
      });
      await saveBillingHolder(database, tenantId, {
        fullName: "Cliente Teste Silva",
        cpf: testCpf(),
      });

      const [customer] = await listCustomerSignals(database, {
        search: marker,
        supplierId: catalog.supplierId,
      });
      expect(customer).toMatchObject({ hasHolder: true, hasSupplier: true });
      expect(customer?.stores).toEqual([
        expect.objectContaining({
          shopName: storeName,
          supplierName: `Fornecedor de teste CUS-${marker}`,
        }),
      ]);
      expect(
        await listCustomerSignals(database, {
          search: marker,
          supplierId: "00000000-0000-4000-8000-000000000000",
        }),
      ).toEqual([]);
    } finally {
      await database
        .update(storeConnections)
        .set({ supplierId: null })
        .where(eq(storeConnections.tenantId, tenantId));
      await catalog.cleanup();
    }
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

async function addOwner(accountId: string, organizationId: string, createdAt: Date) {
  await database
    .insert(member)
    .values({ id: randomUUID(), organizationId, userId: accountId, role: "owner", createdAt });
}

/*
 * Regression: the list joined each account with every profile it owns, so an account with two
 * seller profiles came out twice (a duplicate React key on /admin/clientes), and the team and
 * supplier-only accounts were listed as resellers.
 */
describe("who the customer list holds", () => {
  const listMarker = randomUUID().slice(0, 8);
  const accounts = {
    twoProfiles: randomUUID(),
    agent: randomUUID(),
    supplierOnly: randomUUID(),
  };
  let profiles: Awaited<ReturnType<typeof createTestTenants>>;

  beforeAll(async () => {
    profiles = await createTestTenants(database, 4);
    const [oldest, newest, agentProfile, supplierProfile] = profiles.ids;
    if (oldest == null || newest == null || agentProfile == null || supplierProfile == null) {
      throw new Error(`expected 4 test profiles, got ${profiles.ids.length}`);
    }
    await database
      .update(organization)
      .set({ kind: "supplier" })
      .where(eq(organization.id, supplierProfile));
    const now = new Date();
    await database.insert(user).values(
      [
        { id: accounts.twoProfiles, role: "user" },
        { id: accounts.agent, role: "agent" },
        { id: accounts.supplierOnly, role: "user" },
      ].map((account) => ({
        ...account,
        name: `Conta ${listMarker}`,
        email: `conta-${account.id}-${listMarker}@sellbridge.test`,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await addOwner(accounts.twoProfiles, oldest, new Date(now.getTime() - DAY));
    await addOwner(accounts.twoProfiles, newest, now);
    await addOwner(accounts.agent, agentProfile, now);
    await addOwner(accounts.supplierOnly, supplierProfile, now);
  });

  afterAll(async () => {
    await database.delete(user).where(inArray(user.id, Object.values(accounts)));
    await profiles.cleanup();
  });

  it("lists an account with two profiles once, through its oldest one", async () => {
    const customers = await listCustomerSignals(database, { search: listMarker });
    expect(customers.map((customer) => customer.id)).toEqual([accounts.twoProfiles]);
    expect(customers[0]?.tenantId).toBe(profiles.ids[0]);
    expect((await getCustomer(database, accounts.twoProfiles))?.tenantId).toBe(profiles.ids[0]);
  });
});
