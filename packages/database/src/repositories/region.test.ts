import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cepCache } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { findCachedCep, findTenantRegion, saveCachedCep, saveTenantRegion } from "./region.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

const TEST_CEP = "00000009";

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  await database.delete(cepCache).where(eq(cepCache.cep, TEST_CEP));
});

afterAll(async () => {
  await database.delete(cepCache).where(eq(cepCache.cep, TEST_CEP));
  await tenants.cleanup();
  await database.$client.end();
});

describe("tenant region", () => {
  it("returns null when the tenant has no region yet", async () => {
    const [tenantA] = tenants.ids;
    expect(tenantA).toBeDefined();
    expect(await findTenantRegion(database, tenantA ?? "")).toBeNull();
  });

  it("isolates regions between tenants", async () => {
    const [tenantA, tenantB] = tenants.ids;
    if (!tenantA || !tenantB) {
      throw new Error("tenants de teste não criados");
    }
    await saveTenantRegion(database, tenantA, {
      cep: "30130010",
      state: "MG",
      city: "Belo Horizonte",
      neighborhood: "Centro",
      street: null,
    });
    expect(await findTenantRegion(database, tenantB)).toBeNull();
    expect(await findTenantRegion(database, tenantA)).toMatchObject({
      state: "MG",
      city: "Belo Horizonte",
    });
  });

  it("updates the region on a second save", async () => {
    const [tenantA] = tenants.ids;
    if (!tenantA) {
      throw new Error("tenant de teste não criado");
    }
    await saveTenantRegion(database, tenantA, {
      cep: "01001000",
      state: "SP",
      city: "São Paulo",
      neighborhood: null,
      street: null,
    });
    expect(await findTenantRegion(database, tenantA)).toMatchObject({
      state: "SP",
      neighborhood: null,
    });
  });

  it("keeps the billing holder when a later save changes only the CEP", async () => {
    const [tenantA] = tenants.ids;
    if (!tenantA) {
      throw new Error("tenant de teste não criado");
    }
    const address = {
      cep: "30130010",
      state: "MG" as const,
      city: "Belo Horizonte",
      neighborhood: "Centro",
      street: "Avenida Afonso Pena",
    };
    await saveTenantRegion(database, tenantA, {
      ...address,
      holder: { fullName: "Ana Souza Lima", cpf: "52998224725" },
    });
    const afterCepChange = await saveTenantRegion(database, tenantA, {
      ...address,
      cep: "01001000",
      state: "SP",
      city: "São Paulo",
    });
    expect(afterCepChange).toMatchObject({
      city: "São Paulo",
      fullName: "Ana Souza Lima",
      cpf: "52998224725",
    });
  });
});

describe("cep cache", () => {
  it("returns null for an unknown CEP and stores resolved ones", async () => {
    expect(await findCachedCep(database, "00000009")).toBeNull();
    await saveCachedCep(
      database,
      { cep: "00000009", state: "SP", city: "Teste", neighborhood: null, street: null },
      "test",
      { ok: true },
    );
    expect(await findCachedCep(database, "00000009")).toMatchObject({
      city: "Teste",
      provider: "test",
    });
  });
});
