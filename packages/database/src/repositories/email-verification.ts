import { and, eq, ne } from "drizzle-orm";
import type { Marketplace } from "@sellbridge/shared/schemas";
import type { DatabaseExecutor } from "../client.ts";
import { storeConnections, user } from "../schema/index.ts";

/** Whether the user confirmed the e-mail; false for an unknown user. */
export async function isUserEmailVerified(
  database: DatabaseExecutor,
  userId: string,
): Promise<boolean> {
  const [row] = await database
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  return row?.emailVerified === true;
}

/**
 * Whether the account already has this shop and has not disconnected it: reconnecting it never
 * waits for the e-mail confirmation that a new store does (item 26.b).
 */
export async function hasLiveStoreConnection(
  database: DatabaseExecutor,
  shop: { tenantId: string; marketplace: Marketplace; externalShopId: string },
): Promise<boolean> {
  const [row] = await database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, shop.tenantId),
        eq(storeConnections.marketplace, shop.marketplace),
        eq(storeConnections.externalShopId, shop.externalShopId),
        ne(storeConnections.status, "disconnected"),
      ),
    );
  return row !== undefined;
}
