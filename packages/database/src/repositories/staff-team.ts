import { STAFF_ROLES } from "@sellbridge/shared/staff-access";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { user, userActivity } from "../schema/index.ts";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  banned: boolean;
  createdAt: Date;
  /** When they last used the app themself; null for someone invited who never came in. */
  lastSeenAt: Date | null;
}

/** The SellBridge team (item 28.a), by name. */
export async function listStaffMembers(database: Database): Promise<StaffMember[]> {
  const rows = await database
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      banned: sql<boolean>`coalesce(${user.banned}, false)`,
      createdAt: user.createdAt,
      lastSeenAt: userActivity.lastSeenAt,
    })
    .from(user)
    .leftJoin(userActivity, eq(userActivity.userId, user.id))
    .where(inArray(user.role, [...STAFF_ROLES]))
    .orderBy(asc(user.name));
  return rows.map((row) => ({ ...row, role: row.role ?? "agent" }));
}

/** The account registered with this address, compared without case. */
export async function findAccountByEmail(
  database: Database,
  email: string,
): Promise<{ id: string; email: string; role: string | null } | null> {
  const [row] = await database
    .select({ id: user.id, email: user.email, role: user.role })
    .from(user)
    .where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return row ?? null;
}
