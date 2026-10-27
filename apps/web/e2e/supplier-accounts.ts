import type { Page } from "@playwright/test";
import type { Database } from "@sellbridge/database/client";
import { member, organization, suppliers, user } from "@sellbridge/database/schema";
import { eq, inArray } from "drizzle-orm";
import { signUpAsSupplier } from "./helpers";

/**
 * Supplier accounts a spec signs up, to remove in its `afterAll`. Each run used to leave its
 * brands behind as public suppliers, which then crowded the reseller's supplier picker.
 */
export function supplierAccounts(database: Database) {
  const emails: string[] = [];

  async function signUp(page: Page, name: string): Promise<string> {
    const email = await signUpAsSupplier(page, name);
    emails.push(email);
    return email;
  }

  /**
   * Removes only what these sign-ups created: the brand first (its organization link is
   * `set null`, so it would outlive the organization as a public supplier), then the
   * organization and the user.
   */
  async function removeAll(): Promise<void> {
    if (emails.length === 0) {
      return;
    }
    const accounts = await database
      .select({ userId: user.id, organizationId: member.organizationId })
      .from(user)
      .innerJoin(member, eq(member.userId, user.id))
      .where(inArray(user.email, emails));
    const organizationIds = accounts.map((account) => account.organizationId);
    if (organizationIds.length > 0) {
      await database.delete(suppliers).where(inArray(suppliers.organizationId, organizationIds));
      await database.delete(organization).where(inArray(organization.id, organizationIds));
    }
    await database.delete(user).where(inArray(user.email, emails));
  }

  return { signUp, removeAll };
}

/** Stands in for the brand step: links a new supplier to the account's profile. */
export async function giveTestBrand(
  database: Database,
  email: string,
  name: string,
): Promise<string> {
  const [profile] = await database
    .select({ organizationId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (profile === undefined) {
    throw new Error(`Conta de teste sem perfil: ${email}`);
  }
  const [created] = await database
    .insert(suppliers)
    .values({
      name,
      niche: "Casa e decoração",
      state: "SP",
      city: "Campinas",
      organizationId: profile.organizationId,
    })
    .returning({ id: suppliers.id });
  if (created === undefined) {
    throw new Error(`Marca de teste não criada: ${name}`);
  }
  return created.id;
}
