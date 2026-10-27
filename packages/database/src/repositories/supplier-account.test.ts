import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import {
  findSupplierAccountUserId,
  findSupplierContactEmail,
  isSupplierActive,
} from "./supplier-account.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let withAccount = "";
let withoutAccount = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  users = await createTestUsers(database, 2);
  const [organizationId = ""] = tenants.ids;
  const [owner = "", employee = ""] = users.ids;
  await database.insert(member).values([
    { id: randomUUID(), organizationId, userId: owner, createdAt: new Date(Date.now() - 60_000) },
    { id: randomUUID(), organizationId, userId: employee, createdAt: new Date() },
  ]);
  const rows = await database
    .insert(suppliers)
    .values([
      {
        name: `Com conta ${randomUUID()}`,
        niche: "Teste",
        state: "SP",
        city: "Campinas",
        organizationId,
      },
      { name: `Sem conta ${randomUUID()}`, niche: "Teste", state: "SP", city: "Campinas" },
    ])
    .returning({ id: suppliers.id });
  withAccount = rows[0]?.id ?? "";
  withoutAccount = rows[1]?.id ?? "";
});

afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, withAccount));
  await database.delete(suppliers).where(eq(suppliers.id, withoutAccount));
  await users.cleanup();
  await tenants.cleanup();
  await database.$client.end();
});

describe("findSupplierAccountUserId", () => {
  it("enters as the owner, the first member of the supplier's profile", async () => {
    expect(await findSupplierAccountUserId(database, withAccount)).toBe(users.ids[0]);
  });

  it("finds nobody for a supplier registered by the team without an account", async () => {
    expect(await findSupplierAccountUserId(database, withoutAccount)).toBeNull();
  });
});

describe("isSupplierActive", () => {
  it("is on until the team switches the supplier off", async () => {
    expect(await isSupplierActive(database, withAccount)).toBe(true);
    await database.update(suppliers).set({ active: false }).where(eq(suppliers.id, withAccount));
    expect(await isSupplierActive(database, withAccount)).toBe(false);
    await database.update(suppliers).set({ active: true }).where(eq(suppliers.id, withAccount));
  });

  it("is off for a supplier that does not exist", async () => {
    expect(await isSupplierActive(database, randomUUID())).toBe(false);
  });
});

describe("findSupplierContactEmail", () => {
  it("reads the brand contact, or null when the brand has none", async () => {
    await database
      .update(suppliers)
      .set({ contactEmail: "contato@fornecedor-flags.com.br" })
      .where(eq(suppliers.id, withAccount));
    expect(await findSupplierContactEmail(database, withAccount)).toBe(
      "contato@fornecedor-flags.com.br",
    );
    expect(await findSupplierContactEmail(database, withoutAccount)).toBeNull();
  });
});
