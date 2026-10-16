import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cepCache, tenantProfile } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testCpf } from "../testing/fixtures.ts";
import { findBillingHolder, findCachedCep, saveBillingHolder, saveCachedCep } from "./region.ts";

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

describe("billing holder", () => {
  it("saves the holder alone, with no address and so no region", async () => {
    const [, , tenantC] = tenants.ids;
    if (!tenantC) {
      throw new Error("tenant de teste não criado");
    }
    const holder = { fullName: "Bruno Costa Reis", cpf: testCpf() };
    await saveBillingHolder(database, tenantC, holder);
    expect(await findBillingHolder(database, tenantC)).toEqual(holder);
  });

  it("keeps the address an older profile has when the holder changes", async () => {
    const [tenantA] = tenants.ids;
    if (!tenantA) {
      throw new Error("tenant de teste não criado");
    }
    await database
      .insert(tenantProfile)
      .values({ tenantId: tenantA, cep: "01001000", state: "SP", city: "São Paulo" });
    const holder = { fullName: "Ana Souza Lima Neta", cpf: testCpf() };
    await saveBillingHolder(database, tenantA, holder);
    const [row] = await database
      .select()
      .from(tenantProfile)
      .where(eq(tenantProfile.tenantId, tenantA));
    expect(row).toMatchObject({ ...holder, cep: "01001000", state: "SP" });
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
