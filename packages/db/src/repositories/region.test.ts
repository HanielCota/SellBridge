import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cepCache } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { findCachedCep, findTenantRegion, saveCachedCep, saveTenantRegion } from "./region.ts";

const db = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

const TEST_CEP = "00000009";

beforeAll(async () => {
  tenants = await createTestTenants(db, 2);
  await db.delete(cepCache).where(eq(cepCache.cep, TEST_CEP));
});

afterAll(async () => {
  await db.delete(cepCache).where(eq(cepCache.cep, TEST_CEP));
  await tenants.cleanup();
  await db.$client.end();
});

describe("tenant region", () => {
  it("returns null when the tenant has no region yet", async () => {
    const [tenantA] = tenants.ids;
    expect(tenantA).toBeDefined();
    expect(await findTenantRegion(db, tenantA ?? "")).toBeNull();
  });

  it("isolates regions between tenants", async () => {
    const [tenantA, tenantB] = tenants.ids;
    if (!tenantA || !tenantB) {
      throw new Error("tenants de teste não criados");
    }
    await saveTenantRegion(db, tenantA, {
      cep: "30130010",
      state: "MG",
      city: "Belo Horizonte",
      neighborhood: "Centro",
      street: null,
    });
    expect(await findTenantRegion(db, tenantB)).toBeNull();
    expect(await findTenantRegion(db, tenantA)).toMatchObject({
      state: "MG",
      city: "Belo Horizonte",
    });
  });

  it("updates the region on a second save", async () => {
    const [tenantA] = tenants.ids;
    if (!tenantA) {
      throw new Error("tenant de teste não criado");
    }
    await saveTenantRegion(db, tenantA, {
      cep: "01001000",
      state: "SP",
      city: "São Paulo",
      neighborhood: null,
      street: null,
    });
    expect(await findTenantRegion(db, tenantA)).toMatchObject({ state: "SP", neighborhood: null });
  });
});

describe("cep cache", () => {
  it("returns null for an unknown CEP and stores resolved ones", async () => {
    expect(await findCachedCep(db, "00000009")).toBeNull();
    await saveCachedCep(
      db,
      { cep: "00000009", state: "SP", city: "Teste", neighborhood: null, street: null },
      "test",
      { ok: true },
    );
    expect(await findCachedCep(db, "00000009")).toMatchObject({ city: "Teste", provider: "test" });
  });
});
