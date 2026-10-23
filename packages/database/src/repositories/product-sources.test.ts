import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suppliers, tenantProfile } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testCpf,
  testStoreInput,
} from "../testing/fixtures.ts";
import { findOnboardingProfile, saveBillingHolder, saveProductSourceChoice } from "./region.ts";
import { ensureSellerCatalog } from "./seller-catalog.ts";
import { listStoreConnections, upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;

function tenant(index: number) {
  const id = tenants.ids[index];
  if (id === undefined) throw new Error("Missing test tenant");
  return id;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 4);
  catalog = await createTestSupplierProduct(database, {
    sku: randomUUID(),
    title: "Source choice product",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("persisted product sources", () => {
  it("switches between all modes without changing saved details or an existing store", async () => {
    const tenantId = tenant(0);
    const holder = { fullName: "Product Source Customer", cpf: testCpf(), phone: "11987654321" };
    await saveBillingHolder(database, tenantId, holder);
    await upsertStoreConnection(database, {
      ...testStoreInput(tenantId, randomUUID()),
      supplierId: catalog.supplierId,
    });
    const before = await listStoreConnections(database, tenantId);
    for (const mode of ["both", "own", "suppliers"] as const) {
      await saveProductSourceChoice(database, tenantId, { mode, supplierId: catalog.supplierId });
      const profile = await findOnboardingProfile(database, tenantId);
      expect(profile.productSourceMode).toBe(mode);
      expect(profile.starterSupplier?.id ?? null).toBe(mode === "own" ? null : catalog.supplierId);
      expect(profile.holder).toEqual({ ...holder, company: null });
      expect(await listStoreConnections(database, tenantId)).toEqual(before);
    }
  });

  it("refuses missing, inactive and private sources without replacing the saved choice", async () => {
    const tenantId = tenant(1);
    await saveProductSourceChoice(database, tenantId, { mode: "own" });
    const source = await ensureSellerCatalog(database, tenant(2));
    await expect(saveProductSourceChoice(database, tenantId, { mode: "both" })).rejects.toThrow(
      "Escolha um fornecedor",
    );
    for (const supplierId of [randomUUID(), source.id]) {
      await expect(
        saveProductSourceChoice(database, tenantId, { mode: "both", supplierId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await database
      .update(suppliers)
      .set({ active: false })
      .where(eq(suppliers.id, catalog.supplierId));
    await expect(
      saveProductSourceChoice(database, tenantId, {
        mode: "suppliers",
        supplierId: catalog.supplierId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await findOnboardingProfile(database, tenantId)).toMatchObject({
      productSourceMode: "own",
      starterSupplier: null,
    });
  });

  it("reads legacy supplier profiles and reports inactive suppliers accurately", async () => {
    await database
      .insert(tenantProfile)
      .values({ tenantId: tenant(3), starterSupplierId: catalog.supplierId });
    expect(await findOnboardingProfile(database, tenant(3))).toMatchObject({
      productSourceMode: "suppliers",
      starterSupplier: { id: catalog.supplierId, active: false },
    });
  });
});
