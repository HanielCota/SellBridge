import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../../client.ts";
import { member, organization } from "../../schema/index.ts";

interface ExtraProfileInput {
  userId: string;
  name: string;
  slug: string;
}

/**
 * Gives a seeded account one more seller profile, so a second tab can work on another profile
 * (item "perfil por aba"). The member row is created a second later than the account's own, so
 * the original profile stays the default one. Idempotent by slug.
 */
export async function ensureExtraProfile(
  database: Database,
  input: ExtraProfileInput,
): Promise<{ tenantId: string; created: boolean }> {
  const existing = await database.query.organization.findFirst({
    where: eq(organization.slug, input.slug),
  });
  if (existing) {
    return { tenantId: existing.id, created: false };
  }
  const tenantId = randomUUID();
  const createdAt = new Date(Date.now() + 1000);
  await database.transaction(async (transaction) => {
    await transaction
      .insert(organization)
      .values({ id: tenantId, name: input.name, slug: input.slug, kind: "seller", createdAt });
    await transaction.insert(member).values({
      id: randomUUID(),
      organizationId: tenantId,
      userId: input.userId,
      role: "owner",
      createdAt,
    });
  });
  return { tenantId, created: true };
}
