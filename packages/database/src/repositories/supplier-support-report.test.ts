import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  member,
  storeConnections,
  storeSuppliers,
  suppliers,
  ticketEvents,
} from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import { addTicketMessage, closeTicketForCustomer } from "./support.ts";
import { createTicket } from "./support-create.ts";
import { closeConversationForSupplier } from "./supplier-conversation-queue.ts";
import { listSupplierSupportRows } from "./supplier-support-report.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let resellerTenant = "";
let resellerUser = "";
let supplierUser = "";
let supplierId = "";
let otherSupplierId = "";
let storeId = "";

function idAt(values: readonly string[], index: number): string {
  const value = values.at(index);
  if (value === undefined) {
    throw new Error("incomplete fixture");
  }
  return value;
}

async function insertSupplier(organizationId: string, name: string): Promise<string> {
  const [row] = await database
    .insert(suppliers)
    .values({ name, niche: "Teste", state: "SP", city: "Franca", organizationId })
    .returning({ id: suppliers.id });
  if (row === undefined) {
    throw new Error("supplier not created");
  }
  return row.id;
}

async function openConversation(topic: "order" | "return", toSupplier: string): Promise<string> {
  const created = await createTicket(database, {
    tenantId: resellerTenant,
    userId: resellerUser,
    category: "order",
    subject: "Pedido atrasado",
    body: "O pedido foi pago na segunda e ainda não tem rastreio.",
    attachments: [],
    conversation: { supplierId: toSupplier, storeConnectionId: storeId, topic },
  });
  return created.ticketId;
}

async function supplierReplies(ticketId: string): Promise<void> {
  await addTicketMessage(database, {
    ticketId,
    tenantId: null,
    authorId: supplierUser,
    kind: "reply",
    answeredBy: "supplier",
    body: "Já postamos hoje, segue o rastreio na página do pedido.",
    attachments: [],
  });
}

function rowsSinceAnHourAgo() {
  const since = new Date(Date.now() - 3_600_000);
  return listSupplierSupportRows(database, { supplierId, since, previousSince: since });
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 3);
  users = await createTestUsers(database, 2);
  resellerTenant = idAt(tenants.ids, 0);
  resellerUser = idAt(users.ids, 0);
  supplierUser = idAt(users.ids, 1);
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: resellerTenant,
    userId: resellerUser,
    role: "owner",
    createdAt: new Date(),
  });
  supplierId = await insertSupplier(
    idAt(tenants.ids, 1),
    `Marca Relatório ${randomUUID().slice(0, 6)}`,
  );
  otherSupplierId = await insertSupplier(idAt(tenants.ids, 2), "Marca Vizinha");
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId: resellerTenant,
      marketplace: "mock",
      externalShopId: randomUUID(),
      shopName: "Loja Relatório",
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) {
    throw new Error("store not created");
  }
  storeId = store.id;
  await database.insert(storeSuppliers).values([
    { storeConnectionId: storeId, supplierId },
    { storeConnectionId: storeId, supplierId: otherSupplierId },
  ]);
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, [supplierId, otherSupplierId]));
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("listSupplierSupportRows", () => {
  it("reads the supplier's conversations with the first answer, and no one else's", async () => {
    const answered = await openConversation("order", supplierId);
    const waiting = await openConversation("return", supplierId);
    const neighbour = await openConversation("order", otherSupplierId);
    await supplierReplies(answered);

    const rows = await rowsSinceAnHourAgo();
    const ids = rows.conversations.map((row) => row.id);

    expect(ids).toEqual(expect.arrayContaining([answered, waiting]));
    expect(ids).not.toContain(neighbour);
    expect(rows.conversations.find((row) => row.id === answered)).toMatchObject({
      topic: "order",
      status: "answered",
    });
    expect(rows.conversations.find((row) => row.id === answered)?.firstResponseAt).not.toBeNull();
    expect(rows.conversations.find((row) => row.id === waiting)).toMatchObject({
      topic: "return",
      status: "open",
      firstResponseAt: null,
    });
  });

  it("tells who finished each conversation, and sees the store opening one again", async () => {
    const bySupplier = await openConversation("order", supplierId);
    const byStore = await openConversation("order", supplierId);
    const bySystem = await openConversation("return", supplierId);
    await closeConversationForSupplier(database, {
      ticketId: bySupplier,
      supplierId,
      userId: supplierUser,
    });
    await closeTicketForCustomer(database, {
      ticketId: byStore,
      tenantId: resellerTenant,
      userId: resellerUser,
    });
    await database.insert(ticketEvents).values({
      ticketId: bySystem,
      actorId: null,
      automatic: true,
      type: "status_changed",
      fromValue: "answered",
      toValue: "closed",
    });
    await addTicketMessage(database, {
      ticketId: bySupplier,
      tenantId: resellerTenant,
      authorId: resellerUser,
      kind: "reseller",
      body: "O rastreio ainda não atualizou, pode conferir?",
      attachments: [],
    });

    const rows = await rowsSinceAnHourAgo();
    const closedBy = new Map(rows.closes.map((row) => [row.ticketId, row.closedBy]));

    expect(closedBy.get(bySupplier)).toBe("supplier");
    expect(closedBy.get(byStore)).toBe("store");
    expect(closedBy.get(bySystem)).toBe("automatic");
    expect(rows.reopens.map((row) => row.ticketId)).toContain(bySupplier);
  });
});
