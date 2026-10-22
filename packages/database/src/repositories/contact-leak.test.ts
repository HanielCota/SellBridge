import { randomUUID } from "node:crypto";
import { supplierOrderEmail } from "@sellbridge/shared/supplier-order-email";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, orderItems, orders, tenantProfile, user } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  createTestUsers,
  testAddress,
  testCpf,
  testStoreInput,
} from "../testing/fixtures.ts";
import { forwardRecipients } from "./auto-forward.ts";
import { forwardOrder, getSupplierShipment } from "./fulfillment.ts";
import { upsertStoreConnection } from "./stores.ts";
import { listSupplierHomeShipments, listSupplierShipments } from "./supplier-panel-orders.ts";
import { getSupplierPanelShipment } from "./supplier-panel-orders-detail.ts";

/*
 * The user's rule: a supplier must never get a way to reach the reseller outside SellBridge.
 * A reseller with a known phone, e-mail, CPF and legal name forwards an order; nothing the
 * supplier side reads (link, panel list and detail, the new-order e-mail) may carry any of them.
 */
const database = createTestDatabase();
const stamp = randomUUID().slice(0, 8);
const RESELLER = {
  phone: "11987650123",
  email: `revenda-vazamento-${stamp}@teste.dev`,
  cpf: testCpf(),
  fullName: `Revendedora Vazamento ${stamp}`,
  companyName: `Empresa Vazamento ${stamp}`,
  cnpj: "12345678000190",
  shopName: `Loja leak-${stamp}`,
};
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantId = "";
let token = "";
let shipmentId = "";

async function sellerWithContacts(): Promise<string> {
  tenants = await createTestTenants(database, 1);
  users = await createTestUsers(database, 1);
  const [tenant] = tenants.ids;
  const [userId] = users.ids;
  if (tenant === undefined || userId === undefined) {
    throw new Error("revendedor não criado");
  }
  await database.update(user).set({ email: RESELLER.email }).where(eq(user.id, userId));
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: tenant,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  await database.insert(tenantProfile).values({
    tenantId: tenant,
    fullName: RESELLER.fullName,
    cpf: RESELLER.cpf,
    phone: RESELLER.phone,
    cnpj: RESELLER.cnpj,
    companyName: RESELLER.companyName,
  });
  return tenant;
}

async function paidOrder(): Promise<string> {
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `leak-${stamp}`));
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: `LEAK-${stamp}`,
      status: "paid",
      totalCents: 9900,
      buyerName: "Maria Silva",
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) {
    throw new Error("pedido não criado");
  }
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: catalog.productId,
    title: "Luminária",
    quantity: 1,
    unitPriceCents: 9900,
    unitCostCents: 1000,
  });
  return order.id;
}

/** Every way the reseller's contact could be written in a response. */
function leaksIn(response: unknown): string[] {
  const text = JSON.stringify(response).toLowerCase();
  // Digits alone, so "(11) 98765-0123" or "123.456.789-09" in a response is still caught.
  const digits = text.replace(/\D/g, "");
  const words = [
    RESELLER.email.toLowerCase(),
    RESELLER.fullName.toLowerCase(),
    RESELLER.companyName.toLowerCase(),
    RESELLER.shopName.toLowerCase(),
  ];
  const numbers = [RESELLER.phone, RESELLER.phone.slice(2), RESELLER.cpf, RESELLER.cnpj];
  return [
    ...words.filter((word) => text.includes(word)),
    ...numbers.filter((number) => digits.includes(number)),
  ];
}

beforeAll(async () => {
  catalog = await createTestSupplierProduct(database, {
    sku: `LEAK-${stamp}`,
    title: "Luminária",
    costCents: 1000,
    suggestedPriceCents: 9900,
  });
  tenantId = await sellerWithContacts();
  const orderId = await paidOrder();
  const [link] = await forwardOrder(database, tenantId, {
    orderId,
    address: testAddress,
    notes: "Embalar com plástico bolha",
  });
  if (link === undefined) {
    throw new Error("envio não criado");
  }
  token = link.token;
  shipmentId = link.shipmentId;
});

afterAll(async () => {
  await tenants.cleanup();
  await users.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("what the supplier side reads about a reseller", () => {
  it("keeps the reseller's contact out of the supplier link", async () => {
    expect(leaksIn(await getSupplierShipment(database, token))).toEqual([]);
  });

  it("keeps it out of the supplier panel list, home and detail", async () => {
    const supplierId = catalog.supplierId;
    const list = await listSupplierShipments(database, {
      supplierId,
      tab: "todo",
      query: "",
      page: 1,
    });
    expect(list.items.map((item) => item.id)).toContain(shipmentId);
    expect(leaksIn(list)).toEqual([]);
    expect(leaksIn(await listSupplierHomeShipments(database, supplierId, 10))).toEqual([]);
    expect(leaksIn(await getSupplierPanelShipment(database, { supplierId, shipmentId }))).toEqual(
      [],
    );
  });

  it("keeps it out of the new-order e-mail", async () => {
    const recipients = await forwardRecipients(database, tenantId, [shipmentId]);
    const emails = recipients.map((recipient) =>
      supplierOrderEmail(
        { ...recipient, link: "https://sellbridge.test/x" },
        "https://sellbridge.test",
      ),
    );
    expect(emails.length).toBeGreaterThan(0);
    expect(leaksIn(emails)).toEqual([]);
  });
});
