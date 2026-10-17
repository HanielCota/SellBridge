import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { member, organization } from "../schema/index.ts";

/** One profile (organization) of an account, as the profile switcher and the admin page read it. */
export interface AccountProfileRow {
  id: string;
  slug: string;
  name: string;
  kind: ProfileKind;
  /** The member's role in this profile ("owner" is the titular). */
  memberRole: string;
}

/**
 * Sets what an organization is to its members. Better Auth creates the organization of a new
 * account as a seller (`kind` takes no input through its API), so sign-up marks a supplier here.
 * Returns false when no organization has that id.
 */
export async function setOrganizationKind(
  database: Database,
  organizationId: string,
  kind: ProfileKind,
): Promise<boolean> {
  const updated = await database
    .update(organization)
    .set({ kind })
    .where(eq(organization.id, organizationId))
    .returning({ id: organization.id });
  return updated.length > 0;
}

/** The profiles the user belongs to, oldest first (the first one is the default profile). */
export async function listProfilesOf(
  database: Database,
  userId: string,
): Promise<AccountProfileRow[]> {
  return database
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      kind: organization.kind,
      memberRole: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt), asc(organization.id));
}
