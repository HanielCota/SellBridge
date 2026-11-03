import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { account, session, user } from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import { promoteVerifiedOwner } from "./owner-promotion.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;
let ownerId = "";

async function addSignIn(userId: string, providerId: string) {
  await database.insert(account).values({
    id: randomUUID(),
    accountId: `${providerId}-${userId}`,
    providerId,
    userId,
    password: providerId === "credential" ? "hash" : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function addSession(userId: string) {
  await database.insert(session).values({
    id: randomUUID(),
    token: randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

beforeAll(async () => {
  users = await createTestUsers(database, 1);
  ownerId = users.ids[0] ?? "";
  await database
    .update(user)
    .set({ emailVerified: true, role: "user" })
    .where(eq(user.id, ownerId));
  await addSignIn(ownerId, "credential");
  await addSignIn(ownerId, "google");
  await addSession(ownerId);
  await addSession(ownerId);
});

afterAll(async () => {
  await users.cleanup();
  await database.$client.end();
});

describe("promoteVerifiedOwner", () => {
  it("makes the account an admin and drops every sign-in method and session", async () => {
    await expect(promoteVerifiedOwner(database, ownerId)).resolves.toEqual({
      promoted: true,
      hadPassword: true,
    });
    const [row] = await database.select({ role: user.role }).from(user).where(eq(user.id, ownerId));
    expect(row?.role).toBe("admin");
    expect(await database.select().from(account).where(eq(account.userId, ownerId))).toEqual([]);
    expect(await database.select().from(session).where(eq(session.userId, ownerId))).toEqual([]);
  });

  // Regression (security audit, 31/10/2026): a sign-in that read the password before the promotion
  // committed kept the session it inserted afterwards, already with the admin role.
  it("drops a session left by a sign-in that raced the promotion", async () => {
    await addSession(ownerId);

    await promoteVerifiedOwner(database, ownerId);

    expect(await database.select().from(session).where(eq(session.userId, ownerId))).toEqual([]);
  });

  it("changes nothing for an account that already is an admin", async () => {
    await addSignIn(ownerId, "google");
    await expect(promoteVerifiedOwner(database, ownerId)).resolves.toEqual({
      promoted: false,
      hadPassword: false,
    });
    expect(await database.select().from(account).where(eq(account.userId, ownerId))).toHaveLength(
      1,
    );
  });

  it("keeps the session of an owner who signed in again with a method of their own", async () => {
    await addSession(ownerId);

    await promoteVerifiedOwner(database, ownerId);

    expect(await database.select().from(session).where(eq(session.userId, ownerId))).toHaveLength(
      1,
    );
  });
});
