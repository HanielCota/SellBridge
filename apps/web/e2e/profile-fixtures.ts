import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { Database } from "@sellbridge/database/client";
import { member, organization, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";

/** Accounts with more than one profile, for the profile-per-tab specs. */

export function profileOf(page: Page): string {
  const slug = new URL(page.url()).searchParams.get("perfil");
  if (slug === null) {
    throw new Error(`a página ${page.url()} não tem ?perfil=`);
  }
  return slug;
}

export async function accountId(database: Database, email: string): Promise<string> {
  const [account] = await database.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (account === undefined) {
    throw new Error(`conta ${email} não encontrada`);
  }
  return account.id;
}

/** The profile created at sign-up. */
export async function firstProfile(database: Database, userId: string): Promise<string> {
  const [profile] = await database
    .select({ slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
  if (profile === undefined) {
    throw new Error(`a conta ${userId} não tem perfil`);
  }
  return profile.slug;
}

/** Users cannot create organizations themselves yet, so extra profiles come from the test. */
export async function addExtraProfile(
  database: Database,
  userId: string,
): Promise<{ slug: string; id: string }> {
  const id = randomUUID();
  const slug = `perfil-extra-${id.slice(0, 8)}`;
  await database
    .insert(organization)
    .values({ id, name: "Perfil extra", slug, createdAt: new Date() });
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: id,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  return { slug, id };
}
