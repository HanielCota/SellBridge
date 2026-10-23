import { schema } from "@sellbridge/database";
import { forwardOrder } from "@sellbridge/database/repositories";
import { marketplaceError } from "@sellbridge/marketplaces";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestProduct,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import {
  createShipmentTrackingProcessor,
  type ShipmentTrackingDependencies,
  type TrackedShipping,
} from "./shipment-tracking.ts";

const environment = createWorkerTestEnvironment();
const { database, cipher } = environment;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let storeId = "";

const address = {
  recipient: "Maria Silva",
  street: "Rua das Flores",
  number: "10",
  complement: "",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  postalCode: "01001-000",
};

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  catalog = await createTestProduct(database, {
    sku: "TRK-1",
    title: "Produto rastreio",
    stock: 9,
  });
  const [store] = await database
    .insert(schema.storeConnections)
    .values({
      tenantId: tenants.first,
      marketplace: "mercado_livre",
      externalShopId: `TRK-SHOP-${Date.now()}`,
      shopName: "Loja rastreio",
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
  // The tenant's orders and shipments go first; the supplier ("Fornecedor TRK-1") was left
  // behind on every run and showed up as a public supplier in the reseller's picker.
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

/** A paid order on the Mercado Livre store, already forwarded to the supplier. */
async function forwardedOrder(externalOrderId: string) {
  const [order] = await database
    .insert(schema.orders)
    .values({
      tenantId: tenants.first,
      storeConnectionId: storeId,
      externalOrderId,
      status: "paid",
      totalCents: 4990,
      orderedAt: new Date(),
    })
    .returning();
  if (!order) throw new Error("pedido de teste");
  await database.insert(schema.orderItems).values({
    tenantId: tenants.first,
    orderId: order.id,
    supplierProductId: catalog.productId,
    title: "Produto rastreio",
    quantity: 1,
    unitPriceCents: 4990,
    unitCostCents: 2000,
  });
  await forwardOrder(database, tenants.first, { orderId: order.id, address, notes: "" });
  return order;
}

function shipping(overrides: Partial<TrackedShipping> = {}): TrackedShipping {
  return {
    status: "shipped",
    trackingStatus: "shipped",
    buyerReturnDelivered: false,
    carrier: "Mercado Envios",
    trackingCode: "ML-TRK",
    estimatedDeliveryAt: new Date("2026-10-20T03:00:00.000Z"),
    dispatchDeadlineAt: new Date("2026-10-16T03:00:00.000Z"),
    ...overrides,
  };
}

async function shipmentOf(orderId: string) {
  const [row] = await database
    .select()
    .from(schema.orderShipments)
    .where(eq(schema.orderShipments.orderId, orderId));
  return row;
}

describe("shipment tracking", () => {
  it("reads open Mercado Livre parcels with the store's token and stores what came back", async () => {
    const order = await forwardedOrder(`TRK-${Date.now()}`);
    const readShipping = vi.fn<ShipmentTrackingDependencies["readShipping"]>(async () =>
      shipping(),
    );
    const summary = await createShipmentTrackingProcessor({ database, cipher, readShipping })();

    expect(readShipping).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "ml-access-token" }),
      order.externalOrderId,
    );
    expect(summary.updated).toBeGreaterThanOrEqual(1);
    const row = await shipmentOf(order.id);
    expect(row?.status).toBe("shipped");
    expect(row?.estimatedDeliveryAt?.toISOString()).toBe("2026-10-20T03:00:00.000Z");
  });

  it("keeps going when one order fails and stops reading parcels that are over", async () => {
    const broken = await forwardedOrder(`TRK-BROKEN-${Date.now()}`);
    const fine = await forwardedOrder(`TRK-FINE-${Date.now()}`);
    const readShipping = vi.fn<ShipmentTrackingDependencies["readShipping"]>(
      async (_store, externalOrderId) => {
        if (externalOrderId === broken.externalOrderId) {
          throw marketplaceError("Fora do ar", { retryable: true });
        }
        return shipping({ status: "delivered", trackingStatus: "delivered" });
      },
    );
    const summary = await createShipmentTrackingProcessor({ database, cipher, readShipping })();
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect((await shipmentOf(fine.id))?.status).toBe("delivered");

    // Delivered is final: the next run does not ask about it again.
    readShipping.mockClear();
    await createShipmentTrackingProcessor({ database, cipher, readShipping })();
    const askedFor = readShipping.mock.calls.map(([, externalOrderId]) => externalOrderId);
    expect(askedFor).not.toContain(fine.externalOrderId);
  });
});
