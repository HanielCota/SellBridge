import { asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { member, organization, type OrganizationKind } from "../schema/index.ts";

/** One profile (organization) of an account, as the profile switcher and the admin page read it. */
export interface AccountProfileRow {
  id: string;
  slug: string;
  name: string;
  kind: OrganizationKind;
  /** The member's role in this profile ("owner" is the titular). */
  memberRole: string;
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
