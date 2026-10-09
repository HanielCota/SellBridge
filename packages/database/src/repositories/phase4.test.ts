import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listingTargets,
  orderItems,
  orders,
  supplierProducts,
  suppliers,
  user,
  webhookEvents,
} from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import {
  createListingWithTargets,
  findTargetsNeedingSync,
  markTargetPublished,
  markTargetSynced,
} from "./listings.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  addTicketMessage,
  createTicket,
  getAttachment,
  getTicketThread,
  listAllTickets,
  listTenantTickets,
  setTicketStatus,
} from "./support.ts";
import { findConnectedStoreByShop, recordWebhookEvent } from "./webhooks.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let tenantB = "";
const userIds = [randomUUID(), randomUUID()];
let supplierId = "";
let productId = "";
let storeA = "";
let shopId = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  const [first, second] = tenants.ids;
  if (!first || !second) {
    throw new Error("tenants não criados");
  }
  tenantA = first;
  tenantB = second;
  await database.insert(user).values(
    userIds.map((id, index) => ({
      id,
      name: `Usuário ${index}`,
      email: `phase4-${id}@sellbridge.test`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: "Fornecedor fase 4", niche: "Teste", state: "ZZ", city: "X" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor");
  }
  supplierId = supplier.id;
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: "F4",
      title: "Produto F4",
      costCents: 1500,
      suggestedPriceCents: 3990,
      stock: 8,
    })
    .returning();
  if (!product) {
    throw new Error("produto");
  }
  productId = product.id;
  shopId = `shop-${tenantA}`;
  storeA = (
    await upsertStoreConnection(database, {
      tenantId: tenantA,
      marketplace: "mock",
      externalShopId: shopId,
      shopName: "Loja F4",
      accessTokenEnc: "enc",
      refreshTokenEnc: null,
      expiresAt: null,
    })
  ).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(user).where(inArray(user.id, userIds));
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

describe("support tickets", () => {
  it("creates a ticket with attachment and keeps it inside the tenant", async () => {
    const [authorA] = userIds;
    if (!authorA) {
      throw new Error("usuário");
    }
    const { ticketId } = await createTicket(database, {
      tenantId: tenantA,
      userId: authorA,
      subject: "Pedido não chegou",
      body: "O pedido 123 não foi entregue ao comprador.",
      attachments: [
        { storageKey: "k/1.pdf", fileName: "1.pdf", mimeType: "application/pdf", sizeBytes: 10 },
      ],
    });
    const thread = await getTicketThread(database, ticketId, tenantA);
    expect(thread.ticket.status).toBe("open");
    expect(thread.messages).toHaveLength(1);
    const attachmentId = thread.messages[0]?.attachments[0]?.id ?? "";
    expect(attachmentId).not.toBe("");

    await expect(getTicketThread(database, ticketId, tenantB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getAttachment(database, attachmentId, tenantB)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await getAttachment(database, attachmentId, null)).fileName).toBe("1.pdf");
    expect((await listTenantTickets(database, tenantB, {}, { page: 1, pageSize: 10 })).total).toBe(
      0,
    );
    await expect(
      addTicketMessage(database, {
        ticketId,
        tenantId: tenantB,
        authorId: authorA,
        isAdmin: false,
        body: "tentativa de outro tenant",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moves status between answered, open and closed", async () => {
    const [authorA, admin] = userIds;
    if (!authorA || !admin) {
      throw new Error("usuários");
    }
    const { ticketId } = await createTicket(database, {
      tenantId: tenantA,
      userId: authorA,
      subject: "Dúvida sobre repasse",
      body: "Quando recebo as comissões do fornecedor?",
      attachments: [],
    });
    await addTicketMessage(database, {
      ticketId,
      tenantId: null,
      authorId: admin,
      isAdmin: true,
      body: "Resposta do suporte.",
      attachments: [],
    });
    expect((await getTicketThread(database, ticketId, tenantA)).ticket.status).toBe("answered");

    await addTicketMessage(database, {
      ticketId,
      tenantId: tenantA,
      authorId: authorA,
      isAdmin: false,
      body: "Obrigado, mais uma dúvida.",
      attachments: [],
    });
    expect((await getTicketThread(database, ticketId, tenantA)).ticket.status).toBe("open");

    await setTicketStatus(database, ticketId, "closed");
    await expect(
      addTicketMessage(database, {
        ticketId,
        tenantId: null,
        authorId: admin,
        isAdmin: true,
        body: "Resposta tardia.",
        attachments: [],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const adminList = await listAllTickets(
      database,
      { search: "repasse" },
      { page: 1, pageSize: 10 },
    );
    expect(adminList.items.map((item) => item.id)).toContain(ticketId);
  });
});

describe("webhook events", () => {
  it("stores each external event once", async () => {
    const externalEventId = `evt-${randomUUID()}`;
    const input = {
      marketplace: "mock" as const,
      externalEventId,
      topic: "orders",
      rawPayload: { a: 1 },
      signatureValid: true,
    };
    const first = await recordWebhookEvent(database, input);
    const second = await recordWebhookEvent(database, input);
    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
    await database.delete(webhookEvents).where(eq(webhookEvents.externalEventId, externalEventId));
  });

  it("records invalid events as already processed for auditing", async () => {
    const result = await recordWebhookEvent(database, {
      marketplace: "mock",
      externalEventId: null,
      topic: null,
      rawPayload: null,
      signatureValid: false,
      error: "Assinatura inválida",
    });
    expect(result.status).toBe("created");
    if (result.status !== "created") {
      return;
    }
    const row = await database.query.webhookEvents.findFirst({
      where: eq(webhookEvents.id, result.id),
    });
    expect(row).toMatchObject({ signatureValid: false, error: "Assinatura inválida" });
    expect(row?.processedAt).not.toBeNull();
    await database.delete(webhookEvents).where(eq(webhookEvents.id, result.id));
  });

  it("finds the connected store for a shop across tenants", async () => {
    expect((await findConnectedStoreByShop(database, "mock", shopId))?.tenantId).toBe(tenantA);
    expect(await findConnectedStoreByShop(database, "mock", "shop-inexistente")).toBeNull();
  });
});

describe("marketplace orders and sync", () => {
  it("upserts orders idempotently and links our listing and cost", async () => {
    const created = await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio F4",
        description: "Descrição",
        priceCents: 3990,
      },
      [storeA],
    );
    const [targetId] = created.targetIds;
    if (!targetId) {
      throw new Error("destino");
    }
    await markTargetPublished(database, targetId, { externalId: "EXT-F4", externalUrl: null });

    const incoming = {
      externalOrderId: `ORD-${randomUUID()}`,
      status: "paid" as const,
      totalCents: 7980,
      marketplaceFeeCents: 1100,
      buyerName: "Comprador",
      orderedAt: new Date(),
      items: [
        { externalListingId: "EXT-F4", title: "Anúncio F4", quantity: 2, unitPriceCents: 3990 },
        {
          externalListingId: "OUTRO",
          title: "Item de outro sistema",
          quantity: 1,
          unitPriceCents: 0,
        },
      ],
    };
    const first = await upsertMarketplaceOrder(database, tenantA, storeA, incoming);
    const second = await upsertMarketplaceOrder(database, tenantA, storeA, {
      ...incoming,
      status: "cancelled",
    });
    expect(first.status).toBe("created");
    expect(second).toEqual({ status: "updated", orderId: first.orderId });

    const order = await database.query.orders.findFirst({ where: eq(orders.id, first.orderId) });
    expect(order?.status).toBe("cancelled");
    const items = await database
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, first.orderId));
    expect(items).toHaveLength(2);
    const ours = items.find((item) => item.title === "Anúncio F4");
    expect(ours).toMatchObject({ listingTargetId: targetId, unitCostCents: 1500 });
    expect(items.find((item) => item.title !== "Anúncio F4")?.unitCostCents).toBe(0);

    await expect(upsertMarketplaceOrder(database, tenantB, storeA, incoming)).rejects.toThrow(
      "outro tenant",
    );
  });

  it("lists published listings whose stock or price changed", async () => {
    const created = await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio sync",
        description: "Descrição",
        priceCents: 4500,
      },
      [storeA],
    );
    const [targetId] = created.targetIds;
    if (!targetId) {
      throw new Error("destino");
    }
    await markTargetPublished(database, targetId, { externalId: "EXT-SYNC", externalUrl: null });
    expect(
      (await findTargetsNeedingSync(database, 500)).map((target) => target.targetId),
    ).toContain(targetId);

    await markTargetSynced(database, targetId, { stock: 8, priceCents: 4500 });
    expect(
      (await findTargetsNeedingSync(database, 500)).map((target) => target.targetId),
    ).not.toContain(targetId);

    await database
      .update(supplierProducts)
      .set({ stock: 3 })
      .where(eq(supplierProducts.id, productId));
    const pending = (await findTargetsNeedingSync(database, 500)).find(
      (target) => target.targetId === targetId,
    );
    expect(pending).toMatchObject({ stock: 3, priceCents: 4500, externalId: "EXT-SYNC" });
    await database
      .update(listingTargets)
      .set({ status: "error" })
      .where(eq(listingTargets.id, targetId));
    expect(
      (await findTargetsNeedingSync(database, 500)).map((target) => target.targetId),
    ).not.toContain(targetId);
  });
});
