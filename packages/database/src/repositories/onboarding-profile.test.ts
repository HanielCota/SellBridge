import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testCpf,
} from "../testing/fixtures.ts";
import { findOnboardingProfile, saveBillingHolder, saveStarterSupplier } from "./region.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let inactive: Awaited<ReturnType<typeof createTestSupplierProduct>>;

function tenantAt(index: number): string {
  const tenantId = tenants.ids[index];
  if (tenantId === undefined) {
    throw new Error("tenant de teste não criado");
  }
  return tenantId;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 3);
  catalog = await createTestSupplierProduct(database, {
    sku: `ONB-${tenantAt(0)}`,
    title: "Produto do onboarding",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  inactive = await createTestSupplierProduct(database, {
    sku: `ONB-OFF-${tenantAt(0)}`,
    title: "Produto de fornecedor inativo",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  await database
    .update(suppliers)
    .set({ active: false })
    .where(eq(suppliers.id, inactive.supplierId));
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await inactive.cleanup();
  await database.$client.end();
});

describe("onboarding profile", () => {
  it("starts empty for a new account", async () => {
    expect(await findOnboardingProfile(database, tenantAt(0))).toEqual({
      holder: null,
      starterSupplier: null,
      productSourceMode: null,
    });
  });

  it("keeps the holder and the starter supplier, picked in either order", async () => {
    const tenantId = tenantAt(0);
    await saveStarterSupplier(database, tenantId, catalog.supplierId);
    const holder = { fullName: "Lia Prado Nunes", cpf: testCpf() };
    await saveBillingHolder(database, tenantId, holder);

    const profile = await findOnboardingProfile(database, tenantId);
    expect(profile.holder).toEqual({ ...holder, phone: null, company: null });
    expect(profile.starterSupplier).toMatchObject({
      id: catalog.supplierId,
      state: "ZZ",
      city: "X",
    });
  });

  it("refuses an inactive or unknown supplier", async () => {
    const tenantId = tenantAt(1);
    await expect(
      saveStarterSupplier(database, tenantId, inactive.supplierId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveStarterSupplier(database, tenantId, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await findOnboardingProfile(database, tenantId)).starterSupplier).toBeNull();
  });

  it("isolates profiles between tenants", async () => {
    await saveStarterSupplier(database, tenantAt(2), catalog.supplierId);
    expect((await findOnboardingProfile(database, tenantAt(2))).holder).toBeNull();
    expect((await findOnboardingProfile(database, tenantAt(1))).starterSupplier).toBeNull();
  });
});
