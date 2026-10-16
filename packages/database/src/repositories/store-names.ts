import { and, eq, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { storeConnections } from "../schema/index.ts";

/**
 * Whether the account already has a live store with this name, ignoring case and surrounding
 * spaces. Two stores with the same name could not be told apart on the stores page or when
 * publishing; a disconnected one frees its name.
 */
export async function isStoreNameTaken(
  database: DatabaseExecutor,
  store: { tenantId: string; shopName: string },
): Promise<boolean> {
  const normalizedName = store.shopName.trim().toLowerCase();
  const [row] = await database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, store.tenantId),
        ne(storeConnections.status, "disconnected"),
        eq(sql`lower(btrim(${storeConnections.shopName}))`, normalizedName),
      ),
    )
    .limit(1);
  return row !== undefined;
}
