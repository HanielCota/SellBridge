import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, organization, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import { findSupplierOfProfile, listProfilesOf, setOrganizationKind } from "./account-profiles.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

function idAt(ids: readonly string[], index: number): string {
  const id = ids[index];
  if (id === undefined) {
    throw new Error("registro de teste não criado");
  }
  return id;
}

async function addMember(userId: string, organizationId: string, role: string): Promise<void> {
  await database
    .insert(member)
    .values({ id: randomUUID(), organizationId, userId, role, createdAt: new Date() });
}

beforeAll(async () => {
  users = await createTestUsers(database, 2);
  tenants = await createTestTenants(database, 3);
  await addMember(idAt(users.ids, 0), idAt(tenants.ids, 0), "owner");
  await addMember(idAt(users.ids, 0), idAt(tenants.ids, 1), "member");
  await addMember(idAt(users.ids, 1), idAt(tenants.ids, 2), "owner");
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.organizationId, tenants.ids));
  await database.delete(member).where(inArray(member.organizationId, tenants.ids));
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("account profiles", () => {
  it("lists only the profiles the user is a member of", async () => {
    const profiles = await listProfilesOf(database, idAt(users.ids, 0));

    expect(profiles.map((profile) => profile.id).toSorted()).toEqual(
      [idAt(tenants.ids, 0), idAt(tenants.ids, 1)].toSorted(),
    );
    expect(profiles.find((profile) => profile.id === idAt(tenants.ids, 1))).toMatchObject({
      kind: "seller",
      memberRole: "member",
    });
  });

  it("lists no profile for a user without memberships", async () => {
    expect(await listProfilesOf(database, randomUUID())).toEqual([]);
  });

  it("creates new organizations as seller profiles by default", async () => {
    const [created] = await database
      .select({ kind: organization.kind })
      .from(organization)
      .where(eq(organization.id, idAt(tenants.ids, 0)));

    expect(created?.kind).toBe("seller");
  });

  it("turns a new organization into a supplier profile", async () => {
    const organizationId = idAt(tenants.ids, 2);

    const changed = await setOrganizationKind(database, organizationId, "supplier");

    const [stored] = await database
      .select({ kind: organization.kind })
      .from(organization)
      .where(eq(organization.id, organizationId));
    expect(changed).toBe(true);
    expect(stored?.kind).toBe("supplier");
  });

  it("reports when the organization to mark does not exist", async () => {
    expect(await setOrganizationKind(database, randomUUID(), "supplier")).toBe(false);
  });

  it("finds the supplier a supplier profile runs", async () => {
    const organizationId = idAt(tenants.ids, 2);
    const [created] = await database
      .insert(suppliers)
      .values({
        name: "Ateliê Perfil",
        niche: "Casa",
        state: "SP",
        city: "Campinas",
        organizationId,
      })
      .returning({ id: suppliers.id });

    expect(await findSupplierOfProfile(database, organizationId)).toEqual({
      id: created?.id,
      name: "Ateliê Perfil",
      active: true,
    });
  });

  it("finds no supplier for a profile that has not set up its brand", async () => {
    expect(await findSupplierOfProfile(database, idAt(tenants.ids, 1))).toBeNull();
  });

  it("refuses a second supplier for the same profile", async () => {
    const insertSecond = database.insert(suppliers).values({
      name: "Outro catálogo",
      niche: "Casa",
      state: "SP",
      city: "Campinas",
      organizationId: idAt(tenants.ids, 2),
    });

    await expect(insertSecond).rejects.toMatchObject({
      cause: { constraint_name: "suppliers_organization_id_unique" },
    });
  });

  it("refuses an unknown profile kind", async () => {
    // Raw SQL: the typed insert already refuses "buyer" at compile time.
    const insertUnknown = database.execute(
      sql`insert into organization (id, name, slug, kind, created_at)
          values (${randomUUID()}, 'Tipo inválido', ${`test-kind-${randomUUID()}`}, 'buyer', now())`,
    );

    await expect(insertUnknown).rejects.toMatchObject({
      cause: { constraint_name: "organization_kind_check" },
    });
  });
});
