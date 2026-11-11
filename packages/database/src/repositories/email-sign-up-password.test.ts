import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { account, session, user } from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import { dropEmailSignUpPassword } from "./email-sign-up-password.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];

async function accountWith(options: { fromEmailSignUp: boolean; signIns: string[] }) {
  const users = await createTestUsers(database, 1);
  cleanups.push(users.cleanup);
  const userId = users.ids[0] ?? "";
  await database
    .update(user)
    .set({ emailVerified: true, emailConfirmationRequired: options.fromEmailSignUp })
    .where(eq(user.id, userId));
  for (const providerId of options.signIns) {
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
  await database.insert(session).values({
    id: randomUUID(),
    token: randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
}

async function signInMethods(userId: string) {
  const rows = await database
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));
  return rows.map((row) => row.providerId).toSorted();
}

async function sessionCount(userId: string) {
  return (await database.select().from(session).where(eq(session.userId, userId))).length;
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("dropEmailSignUpPassword", () => {
  it("drops the password and every session of an e-mail sign-up that links Google", async () => {
    const userId = await accountWith({ fromEmailSignUp: true, signIns: ["credential", "google"] });

    const dropped = await dropEmailSignUpPassword(database, userId);

    expect(dropped).toBe(true);
    expect(await signInMethods(userId)).toEqual(["google"]);
    expect(await sessionCount(userId)).toBe(0);
  });

  it("keeps the password of an account that did not start with an e-mail sign-up", async () => {
    const userId = await accountWith({ fromEmailSignUp: false, signIns: ["credential", "google"] });

    const dropped = await dropEmailSignUpPassword(database, userId);

    expect(dropped).toBe(false);
    expect(await signInMethods(userId)).toEqual(["credential", "google"]);
    expect(await sessionCount(userId)).toBe(1);
  });

  it("keeps the sessions of an e-mail sign-up that has no password left", async () => {
    const userId = await accountWith({ fromEmailSignUp: true, signIns: ["google"] });

    const dropped = await dropEmailSignUpPassword(database, userId);

    expect(dropped).toBe(false);
    expect(await sessionCount(userId)).toBe(1);
  });
});
