import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { organization, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import {
  claimSupplierForProfile,
  countSuppliersWithoutPanel,
  getSupplierInviteTarget,
} from "./supplier-panel-invite.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
const createdSupplierIds: string[] = [];

function tenantAt(index: number): string {
  const id = tenants.ids[index];
  if (id === undefined) {
    throw new Error("perfil de teste não criado");
  }
  return id;
}

async function insertSupplier(values: Partial<typeof suppliers.$inferInsert> = {}) {
  const [created] = await database
    .insert(suppliers)
    .values({
      name: "Fornecedor do convite",
      niche: "Casa",
      state: "SP",
      city: "Campinas",
      contactEmail: "pedidos@example.com",
      ...values,
    })
    .returning({ id: suppliers.id });
  if (created === undefined) {
    throw new Error("fornecedor de teste não criado");
  }
  createdSupplierIds.push(created.id);
  return created.id;
}

async function ownerOf(supplierId: string) {
  const [row] = await database
    .select({ organizationId: suppliers.organizationId })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  return row?.organizationId ?? null;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 7);
  // Profiles 0 to 4 are supplier profiles; profiles 5 and 6 stay sellers.
  await database
    .update(organization)
    .set({ kind: "supplier" })
    .where(inArray(organization.id, tenants.ids.slice(0, 5)));
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, createdSupplierIds));
  await tenants.cleanup();
  await database.$client.end();
});

describe("getSupplierInviteTarget", () => {
  it("tells whether a supplier already has a panel owner", async () => {
    const managed = await insertSupplier();
    const owned = await insertSupplier({ organizationId: tenantAt(0) });

    const [managedTarget, ownedTarget] = await Promise.all([
      getSupplierInviteTarget(database, managed),
      getSupplierInviteTarget(database, owned),
    ]);

    expect(managedTarget).toMatchObject({ id: managed, hasPanel: false });
    expect(ownedTarget).toMatchObject({ id: owned, hasPanel: true });
  });

  it("never returns a seller's private catalog", async () => {
    const privateCatalog = await insertSupplier({
      catalogKind: "seller",
      ownerTenantId: tenantAt(5),
    });

    const target = await getSupplierInviteTarget(database, privateCatalog);

    expect(target).toBeNull();
  });
});

describe("claimSupplierForProfile", () => {
  it("hands a team-managed supplier to the supplier profile", async () => {
    const supplierId = await insertSupplier();

    await claimSupplierForProfile(database, { supplierId, organizationId: tenantAt(1) });

    expect(await ownerOf(supplierId)).toBe(tenantAt(1));
  });

  it("refuses a supplier that already has an owner and keeps that owner", async () => {
    const supplierId = await insertSupplier();
    await claimSupplierForProfile(database, { supplierId, organizationId: tenantAt(2) });

    const claim = claimSupplierForProfile(database, { supplierId, organizationId: tenantAt(3) });

    await expect(claim).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await ownerOf(supplierId)).toBe(tenantAt(2));
  });

  it("refuses a profile that already runs a brand of its own", async () => {
    await insertSupplier({ organizationId: tenantAt(4) });
    const supplierId = await insertSupplier();

    const claim = claimSupplierForProfile(database, { supplierId, organizationId: tenantAt(4) });

    await expect(claim).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("já tem uma marca"),
    });
    expect(await ownerOf(supplierId)).toBeNull();
  });

  it("refuses a seller profile", async () => {
    const supplierId = await insertSupplier();

    const claim = claimSupplierForProfile(database, { supplierId, organizationId: tenantAt(5) });

    await expect(claim).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await ownerOf(supplierId)).toBeNull();
  });
});

describe("countSuppliersWithoutPanel", () => {
  it("counts only active directory suppliers with no owner", async () => {
    const before = await countSuppliersWithoutPanel(database);
    await insertSupplier();
    await insertSupplier({ active: false });
    await insertSupplier({ catalogKind: "seller", ownerTenantId: tenantAt(6) });

    const after = await countSuppliersWithoutPanel(database);

    expect(after - before).toBe(1);
  });
});
