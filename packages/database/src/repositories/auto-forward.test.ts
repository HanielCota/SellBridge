import { isForwardEmailFailureNote } from "@sellbridge/shared/forward-notes";
import { randomUUID } from "node:crypto";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, shipmentEvents, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  autoForwardCandidate,
  forwardRecipients,
  noteSupplierEmailFailed,
} from "./auto-forward.ts";
import { forwardOrder, getFulfillmentDetail } from "./fulfillment.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let withEmail: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let withoutEmail: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  withEmail = await createTestSupplierProduct(database, {
    sku: "AUTO-A",
    title: "Vestido",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  withoutEmail = await createTestSupplierProduct(database, {
    sku: "AUTO-B",
    title: "Bolsa",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  await database
    .update(suppliers)
    .set({ contactEmail: "pedidos@fornecedor-auto.com.br", acceptWithinHours: 12 })
    .where(eq(suppliers.id, withEmail.supplierId));
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});
afterAll(async () => {
  await tenants.cleanup();
  await withEmail.cleanup();
  await withoutEmail.cleanup();
  await database.$client.end();
});

async function createOrder(
  products: string[],
  status: "paid" | "pending" | null = "paid",
): Promise<{ id: string; externalOrderId: string }> {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: randomUUID(),
      status: status ?? "paid",
      totalCents: 10000,
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("No order");
  await database.insert(orderItems).values(
    products.map((productId) => ({
      tenantId: tenants.tenantA,
      orderId: order.id,
      supplierProductId: productId === "" ? null : productId,
      title: "Vestido",
      quantity: 2,
      unitPriceCents: 5000,
      unitCostCents: 1000,
    })),
  );
  return order;
}

describe("auto-forward candidate", () => {
  it("is ready when the order is paid, unforwarded and every supplier has an e-mail", async () => {
    const order = await createOrder([withEmail.productId]);
    expect(await autoForwardCandidate(database, order.id)).toMatchObject({
      tenantId: tenants.tenantA,
      externalOrderId: order.externalOrderId,
      blocker: null,
      store: { id: storeId, marketplace: "mock" },
    });
  });

  it("says why an order stays with the reseller", async () => {
    const pending = await createOrder([withEmail.productId], "pending");
    const unlinked = await createOrder([""]);
    const noEmail = await createOrder([withEmail.productId, withoutEmail.productId]);
    const forwarded = await createOrder([withEmail.productId]);
    await forwardOrder(database, tenants.tenantA, {
      orderId: forwarded.id,
      address: testAddress,
      notes: "",
    });
    const blockerOf = async (orderId: string) =>
      (await autoForwardCandidate(database, orderId))?.blocker;
    expect(await blockerOf(pending.id)).toBe("not_paid");
    expect(await blockerOf(unlinked.id)).toBe("unlinked_items");
    expect(await blockerOf(noEmail.id)).toBe("missing_supplier_email");
    expect(await blockerOf(forwarded.id)).toBe("already_forwarded");
    expect(await autoForwardCandidate(database, randomUUID())).toBeNull();
  });
});

describe("forwarding on the reseller's behalf", () => {
  it("records SellBridge as the one who forwarded, with its own note", async () => {
    const order = await createOrder([withEmail.productId]);
    const [link] = await forwardOrder(database, tenants.tenantA, {
      orderId: order.id,
      address: testAddress,
      notes: "",
      actor: "sellbridge",
    });
    if (!link) throw new Error("No link");
    const [event] = await database
      .select({ actor: shipmentEvents.actor, note: shipmentEvents.note })
      .from(shipmentEvents)
      .where(eq(shipmentEvents.shipmentId, link.shipmentId));
    expect(event).toEqual({
      actor: SHIPMENT_ACTORS.sellbridge,
      note: "Pedido encaminhado automaticamente e enviado ao fornecedor por e-mail.",
    });
  });

  it("gives what the supplier e-mail needs, only for the tenant's own parcels", async () => {
    const order = await createOrder([withEmail.productId, withoutEmail.productId]);
    const links = await forwardOrder(database, tenants.tenantA, {
      orderId: order.id,
      address: testAddress,
      notes: "",
    });
    const shipmentIds = links.map((link) => link.shipmentId);
    const recipients = await forwardRecipients(database, tenants.tenantA, shipmentIds);
    expect(recipients).toHaveLength(2);
    expect(recipients.find((row) => row.contactEmail !== null)).toMatchObject({
      contactEmail: "pedidos@fornecedor-auto.com.br",
      externalOrderId: order.externalOrderId,
      acceptWithinHours: 12,
      dispatchWithinHours: 48,
      items: [{ title: "Vestido", sku: "AUTO-A", quantity: 2 }],
    });
    expect(recipients.find((row) => row.contactEmail === null)).toBeDefined();
    expect(await forwardRecipients(database, tenants.tenantB, shipmentIds)).toEqual([]);
  });

  it("tells the reseller in the history when the supplier e-mail did not go out", async () => {
    const order = await createOrder([withEmail.productId]);
    const [link] = await forwardOrder(database, tenants.tenantA, {
      orderId: order.id,
      address: testAddress,
      notes: "",
      actor: "sellbridge",
    });
    if (!link) throw new Error("No link");
    await noteSupplierEmailFailed(database, tenants.tenantB, link.shipmentId);
    await noteSupplierEmailFailed(database, tenants.tenantA, link.shipmentId);
    const detail = await getFulfillmentDetail(database, tenants.tenantA, order.id);
    const notes = detail.shipments[0]?.events.map((event) => event.note) ?? [];
    expect(notes.filter((note) => isForwardEmailFailureNote(note))).toHaveLength(1);
  });
});
