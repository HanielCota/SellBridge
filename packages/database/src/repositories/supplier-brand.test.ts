import type { AdminSupplierValues } from "@sellbridge/shared/schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { createSupplierBrand, getSupplierBrand, updateSupplierBrand } from "./supplier-brand.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

function tenantAt(index: number): string {
  const id = tenants.ids[index];
  if (id === undefined) {
    throw new Error("perfil de teste não criado");
  }
  return id;
}

const BRAND: AdminSupplierValues = {
  name: "Cerâmica do Teste",
  niche: "Casa e decoração",
  description: "",
  state: "SP",
  city: "Campinas",
  logoUrl: null,
  contactEmail: "pedidos@example.com",
  acceptWithinHours: 24,
  dispatchWithinHours: 48,
};

beforeAll(async () => {
  tenants = await createTestTenants(database, 4);
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.organizationId, tenants.ids));
  await tenants.cleanup();
  await database.$client.end();
});

describe("supplier brand", () => {
  it("creates the supplier from the brand step, linked to the profile", async () => {
    const created = await createSupplierBrand(database, {
      organizationId: tenantAt(0),
      values: BRAND,
    });

    expect(created).toMatchObject({ name: "Cerâmica do Teste", city: "Campinas", active: true });
    expect(await getSupplierBrand(database, tenantAt(0))).toMatchObject({
      id: created.id,
      contactEmail: "pedidos@example.com",
    });
  });

  it("refuses a second brand for the same profile", async () => {
    await expect(
      createSupplierBrand(database, {
        organizationId: tenantAt(0),
        values: { ...BRAND, name: "Outra" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("finds no brand for a profile that has not set it up", async () => {
    expect(await getSupplierBrand(database, tenantAt(1))).toBeNull();
  });

  it("does not accept a staff-managed logo during supplier self-registration", async () => {
    const created = await createSupplierBrand(database, {
      organizationId: tenantAt(3),
      values: { ...BRAND, logoUrl: "https://example.com/unreviewed.png" },
    });
    const [stored] = await database.select().from(suppliers).where(eq(suppliers.id, created.id));
    expect(stored?.logoUrl).toBeNull();
  });

  it("updates the profile's own brand and keeps what the team set", async () => {
    const created = await createSupplierBrand(database, {
      organizationId: tenantAt(2),
      values: BRAND,
    });

    await database
      .update(suppliers)
      .set({ logoUrl: "https://example.com/logo.png" })
      .where(eq(suppliers.id, created.id));
    const updated = await updateSupplierBrand(database, {
      organizationId: tenantAt(2),
      values: { ...BRAND, city: "Sorocaba", logoUrl: null, acceptWithinHours: 12 },
    });

    expect(updated).toMatchObject({ id: created.id, city: "Sorocaba", acceptWithinHours: 12 });
    const [stored] = await database.select().from(suppliers).where(eq(suppliers.id, created.id));
    expect(stored?.logoUrl).toBe("https://example.com/logo.png");
  });

  it("does not touch another profile's brand", async () => {
    const before = await getSupplierBrand(database, tenantAt(0));

    await updateSupplierBrand(database, {
      organizationId: tenantAt(2),
      values: { ...BRAND, name: "Só a minha" },
    });

    expect(await getSupplierBrand(database, tenantAt(0))).toEqual(before);
  });

  it("says when the profile has no brand to update", async () => {
    await expect(
      updateSupplierBrand(database, { organizationId: tenantAt(1), values: BRAND }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
