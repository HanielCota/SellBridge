import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets } from "./listings.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";
import { createTicket } from "./support.ts";
import { listTicketOrders } from "./ticket-links.ts";
import { describeTicketAbout, getTicketSubject, linkTicketAbout } from "./ticket-subjects.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let product: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let reseller = "";
let storeA = "";
let storeB = "";
let listingA = "";
let orderA = "";
let externalOrderA = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 1);
  [reseller = ""] = users.ids;
  storeA = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantA, `about-${randomUUID()}`))
  ).id;
  storeB = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantB, `about-${randomUUID()}`))
  ).id;
  product = await createTestSupplierProduct(database, {
    sku: `ABOUT-${randomUUID()}`,
    title: "Fone",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  listingA = (
    await createListingWithTargets(
      database,
      tenants.tenantA,
      {
        supplierProductId: product.productId,
        title: "Fone sem fio",
        description: "Descrição",
        priceCents: 3990,
      },
      [storeA],
    )
  ).listingId;
  externalOrderA = `ORD-${randomUUID()}`;
  orderA = (
    await upsertMarketplaceOrder(database, tenants.tenantA, storeA, {
      externalOrderId: externalOrderA,
      status: "paid",
      totalCents: 2500,
      marketplaceFeeCents: 0,
      buyerName: null,
      orderedAt: new Date("2026-01-01T10:00:00Z"),
      items: [],
    })
  ).orderId;
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await product.cleanup();
  await database.$client.end();
});

async function newTicket() {
  const { ticketId } = await createTicket(database, {
    tenantId: tenants.tenantA,
    userId: reseller,
    category: "order",
    subject: "Pedido atrasado",
    body: "O pedido não chegou ainda.",
    attachments: [],
  });
  return ticketId;
}

describe("describeTicketAbout", () => {
  it("names the workspace's own order, store and listing", async () => {
    const about = await describeTicketAbout(database, tenants.tenantA, {
      orderId: orderA,
      storeConnectionId: storeA,
      listingId: listingA,
    });
    expect(about.order).toEqual({ id: orderA, externalOrderId: externalOrderA });
    expect(about.store?.id).toBe(storeA);
    expect(about.listing).toEqual({ id: listingA, title: "Fone sem fio" });
  });

  it("never names another workspace's records", async () => {
    const about = await describeTicketAbout(database, tenants.tenantB, {
      orderId: orderA,
      storeConnectionId: storeA,
      listingId: listingA,
    });
    expect(about).toEqual({ order: null, store: null, listing: null });
  });
});

describe("linkTicketAbout", () => {
  it("ties the ticket to the order, store and listing it was opened from", async () => {
    const ticketId = await newTicket();
    await linkTicketAbout(database, {
      ticketId,
      tenantId: tenants.tenantA,
      actorId: reseller,
      about: { orderId: orderA, storeConnectionId: storeA, listingId: listingA },
    });
    const orders = await listTicketOrders(database, ticketId);
    expect(orders.map((order) => order.orderId)).toEqual([orderA]);
    const subject = await getTicketSubject(database, ticketId);
    expect(subject.store?.id).toBe(storeA);
    expect(subject.listing?.title).toBe("Fone sem fio");
  });

  it("refuses a store of another workspace", async () => {
    const ticketId = await newTicket();
    await expect(
      linkTicketAbout(database, {
        ticketId,
        tenantId: tenants.tenantA,
        actorId: reseller,
        about: { storeConnectionId: storeB },
      }),
    ).rejects.toThrow("Loja não encontrada nesta conta");
    expect((await getTicketSubject(database, ticketId)).store).toBeNull();
  });
});
