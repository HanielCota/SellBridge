import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orders,
  orderItems,
  supplierReviews,
  tenantProfile,
  ticketMessages,
  tickets,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testCpf,
  testStoreInput,
} from "../testing/fixtures.ts";
import { collectAccountExport } from "./account-export.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let userId = "";
/** A fresh valid CPF: a fixed one collides with the seeded demo account (one account per CPF). */
const holderCpf = testCpf();

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
  return order.id;
}

/** A review of the order's supplier, written by the order's tenant. */
async function addReview(tenantId: string, orderId: string, comment: string) {
  await database.insert(supplierReviews).values({
    tenantId,
    orderId,
    supplierId: catalog.supplierId,
    rating: 2,
    tags: ["dispatch:bad"],
    comment,
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
    // Not the seed demo's CPF (52998224725): the CPF index is unique across accounts.
    cpf: holderCpf,
  });
  const storeA = await upsertStoreConnection(database, testStoreInput(tenantA, `exp-a-${tenantA}`));
  const storeB = await upsertStoreConnection(database, testStoreInput(tenantB, `exp-b-${tenantB}`));
  catalog = await createTestSupplierProduct(database, {
    sku: `EXP-${tenantA}`,
    title: "Sérum facial",
    costCents: 1200,
    suggestedPriceCents: 2495,
  });
  const orderA = await addOrder(tenantA, storeA.id, `EXP-A-${tenantA}`);
  const orderB = await addOrder(tenantB, storeB.id, `EXP-B-${tenantB}`);
  await addReview(tenantA, orderA, "Chegou com a caixa amassada");
  await addReview(tenantB, orderB, "Comentário de outra loja");
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
  await catalog.cleanup();
  await database.$client.end();
});

describe("collectAccountExport", () => {
  it("gathers the account's own data, with no third-party or secret fields", async () => {
    const exported = await collectAccountExport(database, { userId, tenantId: tenantA });
    expect(exported.format).toBe("sellbridge-account-export/1");
    expect(exported.user?.email).toBe(`test-${userId}@sellbridge.test`);
    expect(exported.holder).toEqual({
      fullName: "Ana Revendedora",
      cpf: holderCpf,
      phone: null,
      company: null,
      address: null,
    });
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

  it("keeps the author's own review comments and nobody else's", async () => {
    const exported = await collectAccountExport(database, { userId, tenantId: tenantA });
    expect(exported.supplierReviews).toEqual([
      expect.objectContaining({
        externalOrderId: `EXP-A-${tenantA}`,
        supplierName: `Fornecedor de teste EXP-${tenantA}`,
        rating: 2,
        tags: ["dispatch:bad"],
        comment: "Chegou com a caixa amassada",
      }),
    ]);
    expect(JSON.stringify(exported)).not.toContain("Comentário de outra loja");
  });
});
