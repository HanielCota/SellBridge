import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orderShipments,
  orders,
  storeConnections,
  storeSuppliers,
  suppliers,
  tickets,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenants,
  createTestUsers,
  testAddress,
} from "../testing/fixtures.ts";
import { addTicketMessage } from "./support.ts";
import { createTicket } from "./support-create.ts";
import { closeConversationForSupplier } from "./supplier-conversation-queue.ts";
import {
  countConversationsByStatus,
  listConversations,
  type ConversationViewer,
} from "./supplier-conversations.ts";
import { linkTicketOrder } from "./ticket-links.ts";

const database = createTestDatabase();
const PAGE = { page: 1, pageSize: 50 } as const;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let resellerTenant = "";
let resellerUser = "";
let supplierUser = "";
let supplierId = "";
let otherSupplierId = "";
let storeId = "";
let orderNumber = "";
let cancellationId = "";
let questionId = "";

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

async function insertOrderWithShipment(): Promise<string> {
  orderNumber = `CANC-${randomUUID().slice(0, 8)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: resellerTenant,
      storeConnectionId: storeId,
      externalOrderId: orderNumber,
      status: "paid",
      totalCents: 15_900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) {
    throw new Error("order not created");
  }
  await database.insert(orderShipments).values({
    tenantId: resellerTenant,
    orderId: order.id,
    supplierId,
    status: "shipped",
    address: testAddress,
    items: [],
  });
  return order.id;
}

async function openConversation(input: {
  topic: "cancellation" | "product";
  subject: string;
  withReceipt: boolean;
}): Promise<string> {
  const created = await createTicket(database, {
    tenantId: resellerTenant,
    userId: resellerUser,
    category: input.topic === "cancellation" ? "order" : "listing",
    subject: input.subject,
    body: "O comprador cancelou a compra hoje de manhã pelo marketplace.",
    attachments: input.withReceipt
      ? [
          {
            storageKey: `tests/${randomUUID()}.png`,
            fileName: "cancelamento.png",
            mimeType: "image/png",
            sizeBytes: 1200,
          },
        ]
      : [],
    conversation: { supplierId, storeConnectionId: storeId, topic: input.topic },
  });
  return created.ticketId;
}

const supplierSide = (): ConversationViewer => ({ side: "supplier", supplierId });

beforeAll(async () => {
  tenants = await createTestTenants(database, 3);
  users = await createTestUsers(database, 2);
  resellerTenant = idAt(tenants.ids, 0);
  resellerUser = idAt(users.ids, 0);
  supplierUser = idAt(users.ids, 1);
  supplierId = await insertSupplier(idAt(tenants.ids, 1), `Marca Fila ${randomUUID().slice(0, 6)}`);
  otherSupplierId = await insertSupplier(idAt(tenants.ids, 2), "Marca Outra");
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId: resellerTenant,
      marketplace: "mock",
      externalShopId: randomUUID(),
      shopName: "Loja Centro",
    })
    .returning({ id: storeConnections.id });
  if (store === undefined) {
    throw new Error("store not created");
  }
  storeId = store.id;
  await database.insert(storeSuppliers).values({ storeConnectionId: storeId, supplierId });
  const orderId = await insertOrderWithShipment();
  cancellationId = await openConversation({
    topic: "cancellation",
    subject: "Cancelou depois do envio",
    withReceipt: true,
  });
  await linkTicketOrder(database, {
    ticketId: cancellationId,
    tenantId: resellerTenant,
    orderId,
    actorId: resellerUser,
  });
  questionId = await openConversation({
    topic: "product",
    subject: "Dúvida sobre um produto",
    withReceipt: false,
  });
});

afterAll(async () => {
  await database.delete(orderShipments).where(eq(orderShipments.supplierId, supplierId));
  await database.delete(suppliers).where(inArray(suppliers.id, [supplierId, otherSupplierId]));
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("supplier queue rows", () => {
  it("shows the pinned order with the supplier's parcel and the store's receipt", async () => {
    const page = await listConversations(
      database,
      { viewer: supplierSide(), readerId: supplierUser },
      PAGE,
    );

    const cancellation = page.items.find((item) => item.id === cancellationId);
    const question = page.items.find((item) => item.id === questionId);

    expect(cancellation).toMatchObject({
      topic: "cancellation",
      order: { externalOrderId: orderNumber, shipmentStatus: "shipped" },
    });
    expect(cancellation?.latestStoreAttachmentId).not.toBeNull();
    expect(question).toMatchObject({ order: null, latestStoreAttachmentId: null });
  });

  it("finds a conversation by the number of its order", async () => {
    const page = await listConversations(
      database,
      { viewer: supplierSide(), readerId: supplierUser, search: orderNumber },
      PAGE,
    );

    expect(page.items.map((item) => item.id)).toEqual([cancellationId]);
  });
});

describe("finishing a conversation", () => {
  it("moves it to Finalizado, and the store's next message brings it back to A fazer", async () => {
    const before = await countConversationsByStatus(database, { viewer: supplierSide() });

    await closeConversationForSupplier(database, {
      ticketId: questionId,
      supplierId,
      userId: supplierUser,
    });
    const after = await countConversationsByStatus(database, { viewer: supplierSide() });
    await addTicketMessage(database, {
      ticketId: questionId,
      tenantId: resellerTenant,
      authorId: resellerUser,
      kind: "reseller",
      body: "Ainda preciso saber a medida da forma, por favor.",
      attachments: [],
    });
    const reopened = await countConversationsByStatus(database, { viewer: supplierSide() });

    expect(before).toEqual({ open: 2, answered: 0, closed: 0 });
    expect(after).toEqual({ open: 1, answered: 0, closed: 1 });
    expect(reopened).toEqual({ open: 2, answered: 0, closed: 0 });
  });

  it("changes nothing when finished twice", async () => {
    await closeConversationForSupplier(database, {
      ticketId: cancellationId,
      supplierId,
      userId: supplierUser,
    });
    const [first] = await database
      .select({ closedAt: tickets.closedAt })
      .from(tickets)
      .where(eq(tickets.id, cancellationId));

    await closeConversationForSupplier(database, {
      ticketId: cancellationId,
      supplierId,
      userId: supplierUser,
    });
    const [second] = await database
      .select({ closedAt: tickets.closedAt })
      .from(tickets)
      .where(eq(tickets.id, cancellationId));

    expect(second?.closedAt).toEqual(first?.closedAt);
  });

  it("refuses another supplier's conversation", async () => {
    const attempt = closeConversationForSupplier(database, {
      ticketId: questionId,
      supplierId: otherSupplierId,
      userId: supplierUser,
    });

    await expect(attempt).rejects.toThrow(/Conversa não encontrada/);
  });
});
