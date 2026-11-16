import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orderItems,
  orders,
  storeConnections,
  storeSuppliers,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import {
  addTicketMessage,
  findTicketForMessage,
  getTicketThread,
  listStaffTickets,
  listTenantTickets,
  rateTicket,
} from "./support.ts";
import { createTicket } from "./support-create.ts";
import {
  countUnreadConversations,
  findConversationForViewer,
  findConversationOrder,
  listConversations,
  listConversationStores,
  requireConversationOrder,
  requireConversationStore,
  type ConversationViewer,
} from "./supplier-conversations.ts";

const database = createTestDatabase();
const PAGE = { page: 1, pageSize: 50 } as const;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let resellerTenant = "";
let otherResellerTenant = "";
let resellerUser = "";
let supplierUser = "";
let staffUser = "";
let supplierId = "";
let otherSupplierId = "";
let storeWithSupplier = "";
let storeWithoutSupplier = "";
let conversationId = "";

function idAt(values: readonly string[], index: number): string {
  const value = values.at(index);
  if (value === undefined) {
    throw new Error("fixture incompleta");
  }
  return value;
}

async function insertSupplier(organizationId: string, name: string): Promise<string> {
  const [row] = await database
    .insert(suppliers)
    .values({ name, niche: "Teste", state: "SP", city: "Franca", organizationId })
    .returning({ id: suppliers.id });
  if (row === undefined) {
    throw new Error("fornecedor não criado");
  }
  return row.id;
}

async function insertStore(tenantId: string, shopName: string, supplier: string | null) {
  const [row] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "mock",
      externalShopId: randomUUID(),
      shopName,
    })
    .returning({ id: storeConnections.id });
  if (row === undefined) {
    throw new Error("loja não criada");
  }
  if (supplier !== null) {
    await database
      .insert(storeSuppliers)
      .values({ storeConnectionId: row.id, supplierId: supplier });
  }
  return row.id;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 4);
  users = await createTestUsers(database, 3);
  resellerTenant = idAt(tenants.ids, 0);
  otherResellerTenant = idAt(tenants.ids, 1);
  resellerUser = idAt(users.ids, 0);
  supplierUser = idAt(users.ids, 1);
  staffUser = idAt(users.ids, 2);
  supplierId = await insertSupplier(idAt(tenants.ids, 2), `Marca A ${randomUUID().slice(0, 6)}`);
  otherSupplierId = await insertSupplier(idAt(tenants.ids, 3), "Marca B");
  storeWithSupplier = await insertStore(resellerTenant, "Loja Centro", supplierId);
  storeWithoutSupplier = await insertStore(resellerTenant, "Loja Antiga", null);
  await insertStore(otherResellerTenant, "Loja Vizinha", otherSupplierId);
  const created = await createTicket(database, {
    tenantId: resellerTenant,
    userId: resellerUser,
    category: "order",
    subject: "O pedido está atrasado",
    body: "O pedido 123 foi pago na segunda e ainda não tem rastreio.",
    attachments: [],
    conversation: { supplierId, storeConnectionId: storeWithSupplier, topic: "order" },
  });
  conversationId = created.ticketId;
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, [supplierId, otherSupplierId]));
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

function find(viewer: ConversationViewer) {
  return findConversationForViewer(database, { ticketId: conversationId, viewer });
}

const resellerSide = (): ConversationViewer => ({ side: "reseller", tenantId: resellerTenant });
const supplierSide = (): ConversationViewer => ({ side: "supplier", supplierId });

describe("conversation stores", () => {
  it("offers each store with its supplier and refuses a store without one", async () => {
    const stores = await listConversationStores(database, resellerTenant);
    expect(stores.map((store) => [store.storeName, store.supplierAnswers])).toEqual([
      ["Loja Antiga", false],
      ["Loja Centro", true],
    ]);
    await expect(
      requireConversationStore(database, {
        tenantId: resellerTenant,
        storeConnectionId: storeWithoutSupplier,
        supplierId,
      }),
    ).rejects.toThrow(/ainda não tem um fornecedor/);
  });

  it("never offers another reseller's store", async () => {
    await expect(
      requireConversationStore(database, {
        tenantId: otherResellerTenant,
        storeConnectionId: storeWithSupplier,
        supplierId,
      }),
    ).rejects.toThrow(/Loja não encontrada/);
  });

  it("refuses a supplier the store does not sell", async () => {
    const otherSupplier = randomUUID();

    const requiring = requireConversationStore(database, {
      tenantId: resellerTenant,
      storeConnectionId: storeWithSupplier,
      supplierId: otherSupplier,
    });

    await expect(requiring).rejects.toThrow(/não vende mais este fornecedor/);
  });

  it("sends the conversation to the supplier picked with the store", async () => {
    const store = await requireConversationStore(database, {
      tenantId: resellerTenant,
      storeConnectionId: storeWithSupplier,
      supplierId,
    });

    expect(store).toEqual({ supplierId, storeName: "Loja Centro" });
  });
});

/** An order of the store with one product of the given supplier. */
async function insertOrderOf(supplier: string): Promise<string> {
  const stamp = randomUUID().slice(0, 8);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId: supplier,
      sku: `CONV-${stamp}`,
      title: "Bota de couro",
      costCents: 5000,
      suggestedPriceCents: 9900,
    })
    .returning({ id: supplierProducts.id });
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: resellerTenant,
      storeConnectionId: storeWithSupplier,
      externalOrderId: `CONV-${stamp}`,
      status: "paid",
      totalCents: 9900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (product === undefined || order === undefined) {
    throw new Error("pedido não criado");
  }
  await database.insert(orderItems).values({
    tenantId: resellerTenant,
    orderId: order.id,
    supplierProductId: product.id,
    title: "Bota de couro",
    quantity: 1,
    unitPriceCents: 9900,
    unitCostCents: 5000,
  });
  return order.id;
}

describe("conversation order", () => {
  it("prefills the suppliers whose products the order has", async () => {
    const orderId = await insertOrderOf(supplierId);

    const order = await findConversationOrder(database, { tenantId: resellerTenant, orderId });

    expect(order?.supplierIds).toEqual([supplierId]);
  });

  it("accepts the order for the supplier of its products", async () => {
    const orderId = await insertOrderOf(supplierId);

    const order = await requireConversationOrder(database, {
      tenantId: resellerTenant,
      storeConnectionId: storeWithSupplier,
      orderId,
      supplierId,
    });

    expect(order.orderId).toBe(orderId);
  });

  it("refuses an order that has no product of the picked supplier", async () => {
    const orderId = await insertOrderOf(otherSupplierId);

    await expect(
      requireConversationOrder(database, {
        tenantId: resellerTenant,
        storeConnectionId: storeWithSupplier,
        orderId,
        supplierId,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("conversation scoping", () => {
  it("shows the conversation to its reseller and its supplier only", async () => {
    const mine = await listConversations(
      database,
      { viewer: resellerSide(), readerId: resellerUser },
      PAGE,
    );
    const supplier = await listConversations(
      database,
      { viewer: supplierSide(), readerId: supplierUser },
      PAGE,
    );
    const otherReseller = await listConversations(
      database,
      { viewer: { side: "reseller", tenantId: otherResellerTenant }, readerId: resellerUser },
      PAGE,
    );
    const otherSupplier = await listConversations(
      database,
      { viewer: { side: "supplier", supplierId: otherSupplierId }, readerId: supplierUser },
      PAGE,
    );
    expect(mine.items.map((item) => item.id)).toEqual([conversationId]);
    expect(supplier.items.at(0)).toMatchObject({ storeName: "Loja Centro", topic: "order" });
    expect(otherReseller.items).toEqual([]);
    expect(otherSupplier.items).toEqual([]);
  });

  it("finds the conversation for its two sides and nobody else", async () => {
    expect(await find(resellerSide())).not.toBeNull();
    expect(await find(supplierSide())).not.toBeNull();
    expect(await find({ side: "supplier", supplierId: otherSupplierId })).toBeNull();
    expect(await find({ side: "reseller", tenantId: otherResellerTenant })).toBeNull();
  });

  it("keeps conversations out of the website tickets and the team's own queues", async () => {
    const website = await listTenantTickets(database, resellerTenant, {}, PAGE);
    expect(website.items.map((item) => item.id)).not.toContain(conversationId);
    const all = await listStaffTickets(database, { queue: "all", viewerId: staffUser }, PAGE);
    expect(all.items.map((item) => item.id)).not.toContain(conversationId);
    const readable = await listStaffTickets(
      database,
      { queue: "suppliers", viewerId: staffUser, search: "atrasado" },
      PAGE,
    );
    expect(readable.items.find((item) => item.id === conversationId)?.supplierName).toMatch(
      /^Marca A/,
    );
  });
});

describe("website support routes", () => {
  it("answer not found for a reseller's conversation, so it is read and answered only as one", async () => {
    await expect(getTicketThread(database, conversationId, resellerTenant)).rejects.toThrow(
      /Chamado não encontrado/,
    );
    expect(
      await findTicketForMessage(database, { ticketId: conversationId, tenantId: resellerTenant }),
    ).toBeNull();
    await expect(
      rateTicket(database, {
        ticketId: conversationId,
        tenantId: resellerTenant,
        userId: resellerUser,
        rating: 5,
      }),
    ).rejects.toThrow(/Chamado não encontrado/);
  });

  it("still let the team open the conversation", async () => {
    expect((await getTicketThread(database, conversationId, null)).ticket.audience).toBe(
      "supplier",
    );
    expect(
      await findTicketForMessage(database, { ticketId: conversationId, tenantId: null }),
    ).not.toBeNull();
  });
});

describe("answering a conversation", () => {
  it("lets the supplier answer, marking it answered and unread for the reseller", async () => {
    expect(
      await countUnreadConversations(database, { viewer: supplierSide(), readerId: supplierUser }),
    ).toBe(1);
    const { status } = await addTicketMessage(database, {
      ticketId: conversationId,
      tenantId: null,
      authorId: supplierUser,
      kind: "reply",
      answeredBy: "supplier",
      body: "Postamos hoje à tarde, o rastreio sai amanhã.",
      attachments: [],
    });
    expect(status).toBe("answered");
    expect(
      await countUnreadConversations(database, { viewer: resellerSide(), readerId: resellerUser }),
    ).toBe(1);
    expect(
      await countUnreadConversations(database, { viewer: supplierSide(), readerId: supplierUser }),
    ).toBe(0);
  });

  it("refuses a team reply: the team only reads these conversations", async () => {
    await expect(
      addTicketMessage(database, {
        ticketId: conversationId,
        tenantId: null,
        authorId: staffUser,
        kind: "reply",
        body: "Resposta da equipe que não deveria entrar.",
        attachments: [],
      }),
    ).rejects.toThrow(/Só o fornecedor responde/);
  });
});
