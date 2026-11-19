import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, organization, suppliers, user } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import {
  claimSupplierForProfile,
  countSuppliersWithoutPanel,
  findClaimingProfile,
  getSupplierInviteTarget,
} from "./supplier-panel-invite.ts";
import { listAdminSuppliers } from "./admin-suppliers.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let owner: Awaited<ReturnType<typeof createTestUsers>>;
let ownerId: string;
let ownerEmail: string;
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
  owner = await createTestUsers(database, 1);
  const [createdOwner] = owner.ids;
  if (createdOwner === undefined) {
    throw new Error("Test owner was not created");
  }

  ownerId = createdOwner;
  ownerEmail = `test-${ownerId}@sellbridge.test`;
  await database.update(user).set({ emailVerified: true }).where(eq(user.id, ownerId));
  await database.insert(member).values(
    tenants.ids.map((organizationId) => ({
      id: randomUUID(),
      organizationId,
      userId: ownerId,
      role: "owner",
      createdAt: new Date(),
    })),
  );

  // Profiles 0 to 4 are supplier profiles; profiles 5 and 6 stay sellers.
  await database
    .update(organization)
    .set({ kind: "supplier" })
    .where(inArray(organization.id, tenants.ids.slice(0, 5)));
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, createdSupplierIds));
  await tenants.cleanup();
  await owner.cleanup();
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
    const supplierId = await insertSupplier({ contactEmail: ` ${ownerEmail.toUpperCase()} ` });

    await claimSupplierForProfile(database, {
      supplierId,
      organizationId: tenantAt(1),
      userId: ownerId,
    });

    expect(await ownerOf(supplierId)).toBe(tenantAt(1));
  });

  it("refuses a supplier that already has an owner and keeps that owner", async () => {
    const supplierId = await insertSupplier({ contactEmail: ownerEmail });
    await claimSupplierForProfile(database, {
      supplierId,
      organizationId: tenantAt(2),
      userId: ownerId,
    });

    const claim = claimSupplierForProfile(database, {
      supplierId,
      organizationId: tenantAt(3),
      userId: ownerId,
    });

    await expect(claim).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await ownerOf(supplierId)).toBe(tenantAt(2));
  });

  it("refuses a profile that already runs a brand of its own", async () => {
    await insertSupplier({ organizationId: tenantAt(4) });
    const supplierId = await insertSupplier({ contactEmail: ownerEmail });

    const claim = claimSupplierForProfile(database, {
      supplierId,
      organizationId: tenantAt(4),
      userId: ownerId,
    });

    await expect(claim).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("já tem uma marca"),
    });
    expect(await ownerOf(supplierId)).toBeNull();
  });

  it("refuses a supplier the team switched off", async () => {
    const supplierId = await insertSupplier({ active: false, contactEmail: ownerEmail });

    const claim = claimSupplierForProfile(database, {
      supplierId,
      organizationId: tenantAt(3),
      userId: ownerId,
    });

    await expect(claim).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await ownerOf(supplierId)).toBeNull();
  });

  it("refuses a seller profile", async () => {
    const supplierId = await insertSupplier({ contactEmail: ownerEmail });

    const claim = claimSupplierForProfile(database, {
      supplierId,
      organizationId: tenantAt(5),
      userId: ownerId,
    });

    await expect(claim).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await ownerOf(supplierId)).toBeNull();
  });
});

describe("supplier invite authorization at write time", () => {
  it("refuses a supplier whose order email changed after the invite was read", async () => {
    const supplierId = await insertSupplier({ contactEmail: ownerEmail });
    await database
      .update(suppliers)
      .set({ contactEmail: "new@example.com" })
      .where(eq(suppliers.id, supplierId));

    const claim = claimSupplierForProfile(database, {
      supplierId,
      organizationId: tenantAt(3),
      userId: ownerId,
    });
    await expect(claim).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await ownerOf(supplierId)).toBeNull();
  });

  it("refuses a claimant who no longer owns the profile", async () => {
    const organizationId = tenantAt(3);
    const supplierId = await insertSupplier({ contactEmail: ownerEmail });
    await database
      .update(member)
      .set({ role: "member" })
      .where(eq(member.organizationId, organizationId));

    const claim = claimSupplierForProfile(database, {
      supplierId,
      organizationId,
      userId: ownerId,
    });
    await expect(claim).rejects.toMatchObject({ code: "CONFLICT" });
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

async function ownedProfiles(kinds: readonly ("seller" | "supplier")[]) {
  const owners = await createTestUsers(database, 1);
  const profiles = await createTestTenants(database, kinds.length);
  const userId = owners.ids[0];
  if (userId === undefined) {
    throw new Error("usuário de teste não criado");
  }
  for (const [index, kind] of kinds.entries()) {
    const organizationId = profiles.ids[index];
    if (organizationId === undefined) {
      throw new Error("perfil de teste não criado");
    }
    await database.update(organization).set({ kind }).where(eq(organization.id, organizationId));
    await database.insert(member).values({
      id: randomUUID(),
      organizationId,
      userId,
      role: "owner",
      createdAt: new Date(Date.UTC(2026, 0, index + 1)),
    });
  }
  return {
    userId,
    profileIds: profiles.ids,
    cleanup: async () => {
      await database.delete(suppliers).where(inArray(suppliers.organizationId, profiles.ids));
      await profiles.cleanup();
      await owners.cleanup();
    },
  };
}

describe("findClaimingProfile", () => {
  it("picks the supplier profile that has no brand yet", async () => {
    const owned = await ownedProfiles(["seller", "supplier"]);
    const supplierProfile = owned.profileIds[1];

    const found = await findClaimingProfile(database, owned.userId);

    expect(found).toMatchObject({ status: "found", organizationId: supplierProfile });
    await owned.cleanup();
  });

  it("says when the account has only seller profiles", async () => {
    const owned = await ownedProfiles(["seller"]);

    const found = await findClaimingProfile(database, owned.userId);

    expect(found).toEqual({ status: "no_supplier_profile" });
    await owned.cleanup();
  });

  it("says when every supplier profile already runs a brand", async () => {
    const owned = await ownedProfiles(["supplier"]);
    await database.insert(suppliers).values({
      name: "Marca própria",
      niche: "Casa",
      state: "SP",
      city: "Campinas",
      organizationId: owned.profileIds[0],
    });

    const found = await findClaimingProfile(database, owned.userId);

    expect(found).toEqual({ status: "has_brand" });
    await owned.cleanup();
  });
});

describe("listAdminSuppliers without a panel", () => {
  it("keeps only the suppliers no profile runs yet", async () => {
    const name = `Filtro painel ${randomUUID()}`;
    const managed = await insertSupplier({ name });
    await insertSupplier({ name, organizationId: tenantAt(3) });

    const page = await listAdminSuppliers(
      database,
      name,
      { page: 1, pageSize: 20 },
      { withoutPanel: true },
    );

    expect(page.items.map((supplier) => supplier.id)).toEqual([managed]);
  });
});
