import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeConnections } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import { findStoreOrderStatuses, listOrderCheckStores } from "./order-check.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let storeId = "";
let expiredStoreId = "";
let disconnectedStoreId = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  const tenantId = tenants.ids[0] ?? "";
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `oc-${tenantId}`));
  const expired = await upsertStoreConnection(
    database,
    testStoreInput(tenantId, `oc-expired-${tenantId}`),
  );
  const disconnected = await upsertStoreConnection(
    database,
    testStoreInput(tenantId, `oc-off-${tenantId}`),
  );
  storeId = store.id;
  expiredStoreId = expired.id;
  disconnectedStoreId = disconnected.id;
  await database
    .update(storeConnections)
    .set({ status: "expired" })
    .where(eq(storeConnections.id, expiredStoreId));
  await database
    .update(storeConnections)
    .set({ status: "disconnected" })
    .where(eq(storeConnections.id, disconnectedStoreId));
  await upsertMarketplaceOrder(database, tenantId, storeId, {
    externalOrderId: "OC-STORED",
    status: "pending",
    totalCents: 1000,
    marketplaceFeeCents: 100,
    buyerName: null,
    orderedAt: new Date("2026-11-19T10:00:00.000Z"),
    items: [{ externalListingId: "OC-ITEM", title: "Item", quantity: 1, unitPriceCents: 1000 }],
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("periodic order check lookups", () => {
  it("lists connected stores and the ones without access, never a disconnected one", async () => {
    const ids = (await listOrderCheckStores(database, ["mock"])).map((store) => store.id);

    expect(ids).toEqual(expect.arrayContaining([storeId, expiredStoreId]));
    expect(ids).not.toContain(disconnectedStoreId);
  });

  it("lists no store when no marketplace is checked", async () => {
    expect(await listOrderCheckStores(database, [])).toEqual([]);
  });

  it("returns the status of the orders the store has and leaves out the others", async () => {
    const statuses = await findStoreOrderStatuses(database, storeId, ["OC-STORED", "OC-MISSING"]);

    expect([...statuses]).toEqual([["OC-STORED", "pending"]]);
  });

  it("throws RangeError when more than 1000 numbers are asked at once", async () => {
    const numbers = Array.from({ length: 1001 }, (_value, index) => `OC-${index}`);

    await expect(findStoreOrderStatuses(database, storeId, numbers)).rejects.toThrow(RangeError);
  });
});
