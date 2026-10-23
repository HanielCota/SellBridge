import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestTenants, testCpf } from "../testing/fixtures.ts";
import { findBillingHolder, saveBillingHolder } from "./region.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

beforeAll(async () => {
  tenants = await createTestTenants(database, 5);
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
    expect(await findBillingHolder(database, tenantC)).toEqual({
      ...holder,
      phone: null,
      company: null,
      address: null,
    });
  });

  it("saves the billing address and keeps it when a save leaves it out", async () => {
    const tenantE = tenants.ids[4];
    if (!tenantE) {
      throw new Error("tenant de teste não criado");
    }
    const address = {
      cep: "01310100",
      street: "Avenida Paulista",
      number: "s/n",
      complement: "",
      neighborhood: "Bela Vista",
      city: "São Paulo",
      state: "SP" as const,
    };
    const holder = { fullName: "Diana Lopes Melo", cpf: testCpf(), address };
    await saveBillingHolder(database, tenantE, holder);
    expect((await findBillingHolder(database, tenantE))?.address).toEqual(address);
    await saveBillingHolder(database, tenantE, { fullName: holder.fullName, cpf: holder.cpf });
    expect((await findBillingHolder(database, tenantE))?.address).toEqual(address);
  });

  // Item 26.a (L2): phone, and CNPJ and legal name for who sells as a company.
  it("keeps the phone and the company, and clears the company when it goes", async () => {
    const [tenantA, , tenantC] = tenants.ids;
    if (!tenantA || !tenantC) {
      throw new Error("tenants de teste não criados");
    }
    const holder = {
      fullName: "Alice Prado Lima",
      cpf: testCpf(),
      phone: "11987654321",
      company: { cnpj: "11222333000181", companyName: "Alice Modas Ltda" },
    };
    await saveBillingHolder(database, tenantA, holder);
    expect(await findBillingHolder(database, tenantA)).toEqual({ ...holder, address: null });
    await saveBillingHolder(database, tenantA, { ...holder, company: null });
    expect((await findBillingHolder(database, tenantA))?.company).toBeNull();
    expect((await findBillingHolder(database, tenantC))?.phone).toBeNull();
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
    await expect(saveBillingHolder(database, tenantB, holder)).resolves.toMatchObject(holder);
  });
});
