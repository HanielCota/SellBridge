import { randomUUID } from "node:crypto";
import type { MarketplaceTrackingStatus } from "@sellbridge/shared/schemas";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  member,
  orderItems,
  orders,
  returnClaims,
  suppliers,
  ticketOrders,
  tickets,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { applyMarketplaceShipment, forwardOrder } from "./fulfillment.ts";
import {
  decideReturnClaim,
  findReturnClaimByTicket,
  listSupplierCredits,
} from "./return-claims.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let panelSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let managedSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";
let sellerOwnerId = "";
let supplierOwnerId = "";
let staffId = "";

const UNIT_COST_CENTS = 1500;
const QUANTITY = 2;

function addMember(organizationId: string, userId: string) {
  return database.insert(member).values({
    id: randomUUID(),
    organizationId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 3);
  [sellerOwnerId = "", supplierOwnerId = "", staffId = ""] = users.ids;
  await addMember(tenants.tenantA, sellerOwnerId);
  await addMember(tenants.tenantB, supplierOwnerId);
  panelSupplier = await createTestSupplierProduct(database, {
    sku: "RET-PANEL",
    title: "Tênis",
    costCents: UNIT_COST_CENTS,
    suggestedPriceCents: 6000,
  });
  managedSupplier = await createTestSupplierProduct(database, {
    sku: "RET-MANAGED",
    title: "Boné",
    costCents: UNIT_COST_CENTS,
    suggestedPriceCents: 6000,
  });
  // Tenant B is the panel supplier's own profile: its tickets are the supplier's.
  await database
    .update(suppliers)
    .set({ organizationId: tenants.tenantB })
    .where(eq(suppliers.id, panelSupplier.supplierId));
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});

afterAll(async () => {
  await tenants.cleanup();
  await panelSupplier.cleanup();
  await managedSupplier.cleanup();
  await users.cleanup();
  await database.$client.end();
});

async function createForwardedOrder(productId: string) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: `ML-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 12000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId: tenants.tenantA,
    orderId: order.id,
    supplierProductId: productId,
    title: "Tênis - Preto 40",
    quantity: QUANTITY,
    unitPriceCents: 6000,
    unitCostCents: UNIT_COST_CENTS,
  });
  await forwardOrder(database, tenants.tenantA, {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  return order;
}

function reading(trackingStatus: MarketplaceTrackingStatus | null, buyerReturnDelivered = false) {
  return {
    status: trackingStatus ?? "handling",
    trackingStatus,
    buyerReturnDelivered,
    carrier: "Mercado Envios",
    trackingCode: "ML-777",
  };
}

async function claimsOf(orderId: string) {
  return database.select().from(returnClaims).where(eq(returnClaims.orderId, orderId));
}

async function ticketOf(ticketId: string | null) {
  if (ticketId === null) throw new Error("Claim without ticket");
  const [ticket] = await database.select().from(tickets).where(eq(tickets.id, ticketId));
  if (ticket === undefined) throw new Error("No ticket");
  return ticket;
}

async function returnedOrderClaim(productId: string) {
  const order = await createForwardedOrder(productId);
  await applyMarketplaceShipment(database, tenants.tenantA, order.id, reading("returned"));
  const [claim] = await claimsOf(order.id);
  if (claim === undefined) throw new Error("No claim");
  return { order, claim };
}

describe("openReturnClaims", () => {
  it("opens one claim on the supplier's own ticket when the parcel comes back", async () => {
    const { order, claim } = await returnedOrderClaim(panelSupplier.productId);
    // The return is read again by the next tracking run: still one claim.
    await applyMarketplaceShipment(database, tenants.tenantA, order.id, reading("returned"));

    expect(await claimsOf(order.id)).toHaveLength(1);
    expect(claim.status).toBe("in_review");
    expect(claim.supplierCostCents).toBe(UNIT_COST_CENTS * QUANTITY);
    const ticket = await ticketOf(claim.ticketId);
    expect(ticket.tenantId).toBe(tenants.tenantB);
    expect(ticket.createdById).toBe(supplierOwnerId);
    expect(ticket.subject).toBe(`Devolução do pedido ${order.externalOrderId}`);
    // The reseller's order is never pinned to the supplier's ticket.
    const links = await database
      .select()
      .from(ticketOrders)
      .where(eq(ticketOrders.ticketId, ticket.id));
    expect(links).toHaveLength(0);
  });

  it("opens a claim when the buyer's return reaches the seller after delivery", async () => {
    const order = await createForwardedOrder(panelSupplier.productId);
    await applyMarketplaceShipment(database, tenants.tenantA, order.id, reading("delivered"));
    expect(await claimsOf(order.id)).toHaveLength(0);

    await applyMarketplaceShipment(database, tenants.tenantA, order.id, reading(null, true));

    expect(await claimsOf(order.id)).toHaveLength(1);
  });

  it("gives the ticket to the reseller when the team runs the supplier's catalog", async () => {
    const { order, claim } = await returnedOrderClaim(managedSupplier.productId);

    const ticket = await ticketOf(claim.ticketId);
    expect(ticket.tenantId).toBe(tenants.tenantA);
    expect(ticket.createdById).toBe(sellerOwnerId);
    const links = await database
      .select()
      .from(ticketOrders)
      .where(and(eq(ticketOrders.ticketId, ticket.id), eq(ticketOrders.orderId, order.id)));
    expect(links).toHaveLength(1);
  });
});

describe("decideReturnClaim", () => {
  it("credits the reseller up to the supplier cost, once", async () => {
    const { order, claim } = await returnedOrderClaim(panelSupplier.productId);
    const credit = (amountCents: number) =>
      decideReturnClaim(database, {
        decision: { claimId: claim.id, decision: "credit", amountCents },
        actorId: staffId,
      });

    await expect(credit(claim.supplierCostCents + 1)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await credit(claim.supplierCostCents - 500);
    await expect(credit(100)).rejects.toMatchObject({ code: "CONFLICT" });

    const credits = await listSupplierCredits(database, tenants.tenantA, [order.id]);
    expect(credits).toEqual([
      {
        orderId: order.id,
        status: "credited",
        creditedCents: claim.supplierCostCents - 500,
        refusalReason: null,
      },
    ]);
    const view = await findReturnClaimByTicket(database, claim.ticketId ?? "");
    expect(view?.decidedByName).toBe("Usuário 2");
    expect(view?.items).toEqual([{ title: "Tênis - Preto 40", sku: "RET-PANEL", quantity: 2 }]);
  });

  it("keeps a single decision when two people decide at the same time", async () => {
    const { order, claim } = await returnedOrderClaim(panelSupplier.productId);

    const outcomes = await Promise.allSettled([
      decideReturnClaim(database, {
        decision: { claimId: claim.id, decision: "credit", amountCents: claim.supplierCostCents },
        actorId: staffId,
      }),
      decideReturnClaim(database, {
        decision: { claimId: claim.id, decision: "refuse", reason: "Produto voltou usado" },
        actorId: staffId,
      }),
    ]);

    const settled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(settled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: "CONFLICT" });
    const credits = await listSupplierCredits(database, tenants.tenantA, [order.id]);
    expect(credits).toHaveLength(1);
    expect(credits[0]?.status).toBe(settled[0]?.value.status);
  });

  it("records a refusal with its reason, and only for the reseller who sold it", async () => {
    const { order, claim } = await returnedOrderClaim(panelSupplier.productId);
    await decideReturnClaim(database, {
      decision: { claimId: claim.id, decision: "refuse", reason: "Produto voltou usado" },
      actorId: staffId,
    });

    const [credit] = await listSupplierCredits(database, tenants.tenantA, [order.id]);
    expect(credit?.status).toBe("refused");
    expect(credit?.refusalReason).toBe("Produto voltou usado");
    expect(await listSupplierCredits(database, tenants.tenantB, [order.id])).toEqual([]);
  });
});
