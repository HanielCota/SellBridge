import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { assertStoresSellSupplier, assignStoreSupplier } from "./store-suppliers.ts";
import { listStoreConnections, upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplierOne: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let supplierTwo: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeA = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplierOne = await createTestSupplierProduct(database, {
    sku: `SS1-${tenants.tenantA}`,
    title: "Produto do fornecedor um",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  supplierTwo = await createTestSupplierProduct(database, {
    sku: `SS2-${tenants.tenantA}`,
    title: "Produto do fornecedor dois",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  const input = testStoreInput(tenants.tenantA, `shop-supplier-${tenants.tenantA}`);
  storeA = (await upsertStoreConnection(database, input)).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await supplierOne.cleanup();
  await supplierTwo.cleanup();
  await database.$client.end();
});

describe("store supplier", () => {
  it("starts pending and refuses publishing until the seller picks a supplier", async () => {
    const [store] = await listStoreConnections(database, tenants.tenantA);
    expect(store?.supplierId).toBeNull();
    await expect(
      assertStoresSellSupplier(database, tenants.tenantA, [storeA], supplierOne.supplierId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("accepts only the products of the supplier linked to the shop", async () => {
    await assignStoreSupplier(database, {
      tenantId: tenants.tenantA,
      storeConnectionId: storeA,
      supplierId: supplierOne.supplierId,
    });
    const [store] = await listStoreConnections(database, tenants.tenantA);
    expect(store?.supplierId).toBe(supplierOne.supplierId);
    await expect(
      assertStoresSellSupplier(database, tenants.tenantA, [storeA], supplierOne.supplierId),
    ).resolves.toBeUndefined();
    await expect(
      assertStoresSellSupplier(database, tenants.tenantA, [storeA], supplierTwo.supplierId),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/outro fornecedor/),
    });
  });

  it("refuses linking a shop of another tenant", async () => {
    await expect(
      assignStoreSupplier(database, {
        tenantId: tenants.tenantB,
        storeConnectionId: storeA,
        supplierId: supplierTwo.supplierId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an inactive supplier", async () => {
    await database
      .update(suppliers)
      .set({ active: false })
      .where(eq(suppliers.id, supplierTwo.supplierId));
    await expect(
      assignStoreSupplier(database, {
        tenantId: tenants.tenantA,
        storeConnectionId: storeA,
        supplierId: supplierTwo.supplierId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("goes back to pending when its supplier is deleted", async () => {
    await supplierOne.cleanup();
    const [store] = await listStoreConnections(database, tenants.tenantA);
    expect(store?.supplierId).toBeNull();
  });
});
