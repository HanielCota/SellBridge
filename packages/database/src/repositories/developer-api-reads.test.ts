import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orders } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenantPair,
  grantTestPlan,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  findSealedShippingAddress,
  getOrganizationForDeveloper,
  listOrganizationsForDeveloper,
} from "./developer-api-reads.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let orderId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  await grantTestPlan(database, tenants.tenantA, "pro");
  const store = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantA, `dev-${tenants.tenantA}`),
  );
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: store.id,
      externalOrderId: `DEV-${randomUUID()}`,
      status: "paid",
      totalCents: 5000,
      buyerName: "Mariana",
      shippingAddressEnc: "sealed-address",
      orderedAt: new Date("2026-11-01T13:00:00Z"),
    })
    .returning({ id: orders.id });
  orderId = order?.id ?? "";
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("organizations for developers", () => {
  it("reads the plan of an organization that pays", async () => {
    const found = await getOrganizationForDeveloper(database, tenants.tenantA);

    expect(found).toMatchObject({ id: tenants.tenantA, plan: "pro", billingStatus: "active" });
  });

  it("reads an organization that never billed with empty plan fields", async () => {
    const found = await getOrganizationForDeveloper(database, tenants.tenantB);

    expect(found).toMatchObject({ id: tenants.tenantB, plan: null, billingStatus: null });
  });

  it("refuses an organization that does not exist", async () => {
    const lookup = getOrganizationForDeveloper(database, randomUUID());

    await expect(lookup).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists organizations of every account in pages", async () => {
    const page = await listOrganizationsForDeveloper(database, { page: 1, pageSize: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(2);
  });
});

describe("findSealedShippingAddress", () => {
  it("returns the sealed address of the organization's order", async () => {
    const sealed = await findSealedShippingAddress(database, tenants.tenantA, orderId);

    expect(sealed).toBe("sealed-address");
  });

  it("refuses an order of another organization", async () => {
    const lookup = findSealedShippingAddress(database, tenants.tenantB, orderId);

    await expect(lookup).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
