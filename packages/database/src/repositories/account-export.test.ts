import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orders, orderItems, tenantProfile, ticketMessages, tickets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenantPair,
  createTestUsers,
  testStoreInput,
} from "../testing/fixtures.ts";
import { collectAccountExport } from "./account-export.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantA = "";
let tenantB = "";
let userId = "";

async function addOrder(tenantId: string, storeId: string, externalOrderId: string) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId,
      status: "paid",
      totalCents: 4990,
      marketplaceFeeCents: 700,
      buyerName: "Comprador Terceiro",
      orderedAt: new Date("2026-10-10T12:00:00Z"),
    })
    .returning({ id: orders.id });
  if (order === undefined) {
    throw new Error("pedido não criado");
  }
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    title: "Sérum facial",
    quantity: 2,
    unitPriceCents: 2495,
    unitCostCents: 1200,
  });
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  users = await createTestUsers(database, 1);
  userId = users.ids[0] ?? "";
  await database.insert(tenantProfile).values({
    tenantId: tenantA,
    fullName: "Ana Revendedora",
    cpf: "52998224725",
  });
  const storeA = await upsertStoreConnection(database, testStoreInput(tenantA, `exp-a-${tenantA}`));
  const storeB = await upsertStoreConnection(database, testStoreInput(tenantB, `exp-b-${tenantB}`));
  await addOrder(tenantA, storeA.id, `EXP-A-${tenantA}`);
  await addOrder(tenantB, storeB.id, `EXP-B-${tenantB}`);
  const [ticket] = await database
    .insert(tickets)
    .values({ tenantId: tenantA, createdById: userId, subject: "Dúvida sobre repasse" })
    .returning({ id: tickets.id });
  if (ticket === undefined) {
    throw new Error("chamado não criado");
  }
  await database.insert(ticketMessages).values([
    { ticketId: ticket.id, authorId: userId, isAdmin: false, body: "Quando cai o repasse?" },
    {
      ticketId: ticket.id,
      authorId: userId,
      isAdmin: true,
      isInternal: true,
      body: "Nota da equipe",
    },
  ]);
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("collectAccountExport", () => {
  it("gathers the account's own data, with no third-party or secret fields", async () => {
    const exported = await collectAccountExport(database, { userId, tenantId: tenantA });
    expect(exported.format).toBe("sellbridge-account-export/1");
    expect(exported.user?.email).toBe(`test-${userId}@sellbridge.test`);
    expect(exported.holder).toEqual({ fullName: "Ana Revendedora", cpf: "52998224725" });
    expect(exported.stores).toHaveLength(1);
    expect(exported.orders).toEqual([
      expect.objectContaining({
        externalOrderId: `EXP-A-${tenantA}`,
        items: [{ title: "Sérum facial", quantity: 2, unitPriceCents: 2495, unitCostCents: 1200 }],
      }),
    ]);
    expect(exported.tickets[0]?.messages).toEqual([
      expect.objectContaining({ from: "Você", body: "Quando cai o repasse?" }),
    ]);
    const text = JSON.stringify(exported);
    // The buyer is someone else; tokens and internal team notes are not the account's data.
    expect(text).not.toContain("Comprador Terceiro");
    expect(text).not.toContain("enc-access");
    expect(text).not.toContain("Nota da equipe");
    expect(text).not.toContain(`EXP-B-${tenantB}`);
  });
});
