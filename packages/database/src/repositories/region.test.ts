import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cepCache } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testCpf } from "../testing/fixtures.ts";
import {
  findBillingHolder,
  findCachedCep,
  findTenantRegion,
  saveBillingHolder,
  saveCachedCep,
  saveTenantRegion,
} from "./region.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

const TEST_CEP = "00000009";

beforeAll(async () => {
  tenants = await createTestTenants(database, 4);
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
    const cpf = testCpf();
    await saveTenantRegion(database, tenantA, {
      ...address,
      holder: { fullName: "Ana Souza Lima", cpf },
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
      cpf,
    });
  });
});

describe("billing holder", () => {
  it("saves the holder alone, with no address and so no region", async () => {
    const [, , tenantC] = tenants.ids;
    if (!tenantC) {
      throw new Error("tenant de teste não criado");
    }
    const holder = { fullName: "Bruno Costa Reis", cpf: testCpf() };
    await saveBillingHolder(database, tenantC, holder);
    expect(await findBillingHolder(database, tenantC)).toEqual(holder);
    expect(await findTenantRegion(database, tenantC)).toBeNull();
  });

  it("keeps the address an older profile has when the holder changes", async () => {
    const [tenantA] = tenants.ids;
    if (!tenantA) {
      throw new Error("tenant de teste não criado");
    }
    const holder = { fullName: "Ana Souza Lima Neta", cpf: testCpf() };
    await saveBillingHolder(database, tenantA, holder);
    expect(await findTenantRegion(database, tenantA)).toMatchObject({ ...holder, state: "SP" });
  });

  it("refuses a CPF already used by another account", async () => {
    const [, tenantB, , tenantD] = tenants.ids;
    if (!tenantB || !tenantD) {
      throw new Error("tenants de teste não criados");
    }
    const cpf = testCpf();
    await saveBillingHolder(database, tenantB, { fullName: "Carla Dias", cpf });
    await expect(
      saveBillingHolder(database, tenantD, { fullName: "Daniel Dias", cpf }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/CPF já está/) });
    expect(await findBillingHolder(database, tenantD)).toBeNull();
  });

  it("lets the same account save its own CPF again", async () => {
    const [, tenantB] = tenants.ids;
    if (!tenantB) {
      throw new Error("tenant de teste não criado");
    }
    const holder = { fullName: "Carla Dias Moura", cpf: testCpf() };
    await saveBillingHolder(database, tenantB, holder);
    await expect(saveBillingHolder(database, tenantB, holder)).resolves.toEqual(holder);
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
