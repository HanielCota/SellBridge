import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestTenants, testCpf } from "../testing/fixtures.ts";
import { findBillingHolder, saveBillingHolder } from "./region.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

beforeAll(async () => {
  tenants = await createTestTenants(database, 4);
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("billing holder", () => {
  it("saves and reads the billing holder", async () => {
    const [, , tenantC] = tenants.ids;
    if (!tenantC) {
      throw new Error("tenant de teste não criado");
    }
    const holder = { fullName: "Bruno Costa Reis", cpf: testCpf() };
    await saveBillingHolder(database, tenantC, holder);
    expect(await findBillingHolder(database, tenantC)).toEqual(holder);
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
