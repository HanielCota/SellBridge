import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderShipments } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { listParcelsInTransit, listTrackedParcels } from "./shipment-tracking.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;

/** Unique per run: the shared test database keeps other runs' parcels. */
const runDigits = String(Date.now()).slice(-9).padStart(9, "0");
const codeOfTenantB = `QB${runDigits}BR`;
const orderNumberOfTenantB = `9${runDigits}`;
/** How the supplier typed it: lower case, with spaces and dots. */
const typedCodeOfTenantB = `qb ${runDigits.slice(0, 3)}.${runDigits.slice(3)} br`;

async function shippedParcel(tenantId: string, externalOrderId: string, trackingCode: string) {
  const store = await upsertStoreConnection(
    database,
    testStoreInput(tenantId, `tracking-${randomUUID()}`),
  );
  const { orderId } = await upsertMarketplaceOrder(database, tenantId, store.id, {
    externalOrderId,
    status: "paid",
    totalCents: 2500,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: new Date(),
    items: [],
  });
  await database.insert(orderShipments).values({
    tenantId,
    orderId,
    supplierId: supplier.supplierId,
    address: testAddress,
    items: [],
    status: "shipped",
    carrier: "Correios",
    trackingCode,
  });
  return orderId;
}

let orderOfTenantB = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplier = await createTestSupplierProduct(database, {
    sku: `TRACK-${randomUUID()}`,
    title: "Fone",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  orderOfTenantB = await shippedParcel(tenants.tenantB, orderNumberOfTenantB, typedCodeOfTenantB);
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

describe("tracked parcels stay inside the reseller's account", () => {
  it("finds its own parcel by the code saved with spaces, dots and lower case", async () => {
    const parcels = await listTrackedParcels(database, tenants.tenantB, {
      kind: "search",
      trackingCode: codeOfTenantB,
      externalOrderId: "",
    });
    expect(parcels.map((parcel) => parcel.orderId)).toEqual([orderOfTenantB]);
  });

  it("never returns another reseller's parcel by its tracking code or order number", async () => {
    const byCode = await listTrackedParcels(database, tenants.tenantA, {
      kind: "search",
      trackingCode: codeOfTenantB,
      externalOrderId: orderNumberOfTenantB,
    });
    const byOrder = await listTrackedParcels(database, tenants.tenantA, {
      kind: "order",
      orderId: orderOfTenantB,
    });
    expect(byCode).toEqual([]);
    expect(byOrder).toEqual([]);
  });

  it("lists only the reseller's own parcels on their way", async () => {
    const ofTenantA = await listParcelsInTransit(database, tenants.tenantA, 10);
    const ofTenantB = await listParcelsInTransit(database, tenants.tenantB, 10);
    expect(ofTenantA).toEqual([]);
    expect(ofTenantB.map((parcel) => parcel.trackingCode)).toEqual([typedCodeOfTenantB]);
  });
});
