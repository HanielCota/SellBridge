import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { account, member, organization, user } from "../schema/index.ts";

interface SeedAccountInput {
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  organizationSlug: string;
}

export interface SeededAccount {
  userId: string;
  tenantId: string;
  created: boolean;
}

/**
 * Creates a credential user with its own organization, mirroring what the
 * Better Auth sign-up hooks do in the web app. Idempotent by e-mail.
 */
/** Keeps an already seeded account in sync with the current SEED_*_PASSWORD value. */
async function updateSeededPassword(
  database: Database,
  userId: string,
  password: string,
): Promise<void> {
  await database
    .update(account)
    .set({ password: await hashPassword(password), updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
}

export async function ensureAccount(
  database: Database,
  input: SeedAccountInput,
): Promise<SeededAccount> {
  const existing = await database.query.user.findFirst({ where: eq(user.email, input.email) });
  if (existing) {
    const membership = await database.query.member.findFirst({
      where: eq(member.userId, existing.id),
    });
    if (!membership) {
      throw new Error(`Usuário ${input.email} existe mas não tem organização`);
    }
    await updateSeededPassword(database, existing.id, input.password);
    return { userId: existing.id, tenantId: membership.organizationId, created: false };
  }

  const userId = randomUUID();
  const tenantId = randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(input.password);

  await database.transaction(async (transaction) => {
    await transaction.insert(user).values({
      id: userId,
      name: input.name,
      email: input.email,
      emailVerified: true,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(organization).values({
      id: tenantId,
      name: input.name,
      slug: input.organizationSlug,
      createdAt: now,
    });
    await transaction.insert(member).values({
      id: randomUUID(),
      organizationId: tenantId,
      userId,
      role: "owner",
      createdAt: now,
    });
  });

  return { userId, tenantId, created: true };
}
