import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeConnections, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import { addTicketMessage, listStaffTickets, listTenantTickets } from "./support.ts";
import { createTicket } from "./support-create.ts";
import {
  countUnreadConversations,
  findConversationForViewer,
  listConversations,
  listConversationStores,
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
      supplierId: supplier,
    })
    .returning({ id: storeConnections.id });
  if (row === undefined) {
    throw new Error("loja não criada");
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
      }),
    ).rejects.toThrow(/ainda não tem um fornecedor/);
  });

  it("never offers another reseller's store", async () => {
    await expect(
      requireConversationStore(database, {
        tenantId: otherResellerTenant,
        storeConnectionId: storeWithSupplier,
      }),
    ).rejects.toThrow(/Loja não encontrada/);
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
