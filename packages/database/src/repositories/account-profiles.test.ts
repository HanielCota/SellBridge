import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, organization } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import { listProfilesOf } from "./account-profiles.ts";

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
