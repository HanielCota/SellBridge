import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestTenantPair, testStoreInput } from "../testing/fixtures.ts";
import { isStoreNameTaken } from "./store-names.ts";
import { disconnectStore, upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  const { tenantA } = tenants;
  await upsertStoreConnection(database, {
    ...testStoreInput(tenantA, `named-${tenantA}`),
    shopName: "Loja da Ana",
  });
  const gone = await upsertStoreConnection(database, {
    ...testStoreInput(tenantA, `gone-${tenantA}`),
    shopName: "Loja Antiga",
  });
  await disconnectStore(database, tenantA, gone.id);
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("isStoreNameTaken", () => {
  it("finds a live store of the account by name, ignoring case and spaces", async () => {
    const shopName = "  LOJA DA ANA ";
    expect(await isStoreNameTaken(database, { tenantId: tenants.tenantA, shopName })).toBe(true);
  });

  it("frees the name of a disconnected store", async () => {
    const shopName = "Loja Antiga";
    expect(await isStoreNameTaken(database, { tenantId: tenants.tenantA, shopName })).toBe(false);
  });

  it("ignores stores of other accounts", async () => {
    const shopName = "Loja da Ana";
    expect(await isStoreNameTaken(database, { tenantId: tenants.tenantB, shopName })).toBe(false);
  });
});
