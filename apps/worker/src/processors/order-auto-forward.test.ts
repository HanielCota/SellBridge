import { randomUUID } from "node:crypto";
import { schema } from "@sellbridge/database";
import { marketplaceError } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import type { OutgoingEmail } from "@sellbridge/shared/mailer";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestProduct,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createAutoForwardProcessor, type AutoForwardDependencies } from "./order-auto-forward.ts";

const environment = createWorkerTestEnvironment();
const { database, cipher } = environment;
const appUrl = "https://app.sellbridge.test";
const supplierEmail = "pedidos@fornecedor-auto.test";
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let storeId = "";

const address = {
  recipient: "Maria Silva",
  street: "Rua das Acácias",
  number: "321",
  complement: "",
  neighborhood: "Centro",
  city: "Campinas",
  state: "SP",
  postalCode: "13010-000",
};

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  catalog = await createTestProduct(database, { sku: "AUTO-1", title: "Vestido", stock: 9 });
  await setSupplierEmail(supplierEmail);
  const [store] = await database
    .insert(schema.storeConnections)
    .values({
      tenantId: tenants.first,
      marketplace: "mercado_livre",
      externalShopId: `AUTO-SHOP-${Date.now()}`,
      shopName: "Loja automática",
      accessTokenEnc: cipher.encrypt("ml-access-token"),
      refreshTokenEnc: cipher.encrypt("ml-refresh-token"),
      expiresAt: new Date(Date.now() + 3_600_000),
      status: "connected",
    })
    .returning();
  if (!store) throw new Error("loja de teste");
  storeId = store.id;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

const readAddress = vi.fn<AutoForwardDependencies["readAddress"]>();
const sendEmail = vi.fn<(email: OutgoingEmail) => Promise<void>>();
beforeEach(() => {
  readAddress.mockReset();
  readAddress.mockResolvedValue(address);
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
});

async function setSupplierEmail(contactEmail: string | null) {
  await database
    .update(schema.suppliers)
    .set({ contactEmail })
    .where(eq(schema.suppliers.id, catalog.supplierId));
}

function processor(enabled = true) {
  return createAutoForwardProcessor({ database, cipher, readAddress, sendEmail, appUrl, enabled });
}

function job(orderId: string, attemptsMade = 0) {
  return { data: { orderId }, attemptsMade, maxAttempts: 5 };
}

async function paidOrder() {
  const [order] = await database
    .insert(schema.orders)
    .values({
      tenantId: tenants.first,
      storeConnectionId: storeId,
      externalOrderId: `AUTO-${randomUUID()}`,
      status: "paid",
      totalCents: 9980,
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("pedido de teste");
  await database.insert(schema.orderItems).values({
    tenantId: tenants.first,
    orderId: order.id,
    supplierProductId: catalog.productId,
    title: "Vestido",
    quantity: 2,
    unitPriceCents: 4990,
    unitCostCents: 2000,
  });
  return order;
}

async function shipmentsOf(orderId: string) {
  return database
    .select()
    .from(schema.orderShipments)
    .where(eq(schema.orderShipments.orderId, orderId));
}

describe("order auto-forward", () => {
  it("forwards a paid order to the marketplace address and e-mails the supplier", async () => {
    const order = await paidOrder();
    expect(await processor()(job(order.id))).toBe("forwarded");

    expect(readAddress).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "ml-access-token" }),
      order.externalOrderId,
    );
    const [shipment] = await shipmentsOf(order.id);
    expect(shipment?.address).toEqual(address);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [email] = sendEmail.mock.calls[0] ?? [];
    expect(email?.to).toBe(supplierEmail);
    expect(email?.text).toContain(`${appUrl}/fornecedor/pedido/`);
    expect(email?.text).not.toContain(address.street);
  });

  it("does nothing while the flag is off", async () => {
    const order = await paidOrder();
    expect(await processor(false)(job(order.id))).toBe("disabled");
    expect(readAddress).not.toHaveBeenCalled();
    expect(await shipmentsOf(order.id)).toEqual([]);
  });

  it("leaves the order with the reseller when the marketplace gives no address", async () => {
    const order = await paidOrder();
    readAddress.mockResolvedValue(null);
    expect(await processor()(job(order.id))).toBe("no_address");
    expect(await shipmentsOf(order.id)).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("leaves the order with the reseller when the supplier has no e-mail", async () => {
    const order = await paidOrder();
    await setSupplierEmail(null);
    try {
      expect(await processor()(job(order.id))).toBe("not_eligible");
      expect(readAddress).not.toHaveBeenCalled();
    } finally {
      await setSupplierEmail(supplierEmail);
    }
  });

  it("forwards an order only once", async () => {
    const order = await paidOrder();
    expect(await processor()(job(order.id))).toBe("forwarded");
    expect(await processor()(job(order.id))).toBe("not_eligible");
    expect(await shipmentsOf(order.id)).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("tries again later while the marketplace has no parcel yet, then gives up", async () => {
    const order = await paidOrder();
    readAddress.mockRejectedValue(
      marketplaceError("O Mercado Livre ainda não criou o envio deste pedido.", {
        retryable: false,
      }),
    );
    await expect(processor()(job(order.id, 0))).rejects.toThrow(/ainda não criou o envio/);
    expect(await processor()(job(order.id, 4))).toBe("gave_up");
    expect(await shipmentsOf(order.id)).toEqual([]);
  });

  it("keeps the forward when the e-mail fails and says so in the history", async () => {
    const order = await paidOrder();
    sendEmail.mockRejectedValue(new Error("provider down"));
    expect(await processor()(job(order.id))).toBe("forwarded");
    const [shipment] = await shipmentsOf(order.id);
    if (!shipment) throw new Error("envio não criado");
    const events = await database
      .select({ note: schema.shipmentEvents.note })
      .from(schema.shipmentEvents)
      .where(eq(schema.shipmentEvents.shipmentId, shipment.id));
    expect(events.map((event) => event.note).join(" ")).toContain(
      "O e-mail ao fornecedor não foi enviado",
    );
  });

  it("never writes the address, the e-mail or the link to the log", async () => {
    const info = vi.spyOn(logger, "info");
    const warn = vi.spyOn(logger, "warn");
    try {
      const order = await paidOrder();
      sendEmail.mockRejectedValueOnce(new Error("provider down"));
      await processor()(job(order.id));
      const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
      expect(logged).not.toContain(address.street);
      expect(logged).not.toContain(supplierEmail);
      expect(logged).not.toContain("/fornecedor/pedido/");
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
