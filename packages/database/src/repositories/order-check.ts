import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, storeConnections } from "../schema/index.ts";
import type { Marketplace } from "./stores.ts";

/** Statuses of a store that should be selling but cannot be read: the reseller must reconnect it. */
const STATUSES_WITHOUT_ACCESS = ["expired", "error"] as const;

/**
 * The stores the periodic order check visits: connected ones with a token, and the ones that lost
 * their access, so the team sees them. A store the reseller disconnected is left out on purpose.
 */
export async function listOrderCheckStores(
  database: Database,
  marketplaces: readonly Marketplace[],
) {
  if (marketplaces.length === 0) {
    return [];
  }
  return database
    .select({
      id: storeConnections.id,
      tenantId: storeConnections.tenantId,
      marketplace: storeConnections.marketplace,
      externalShopId: storeConnections.externalShopId,
      shopName: storeConnections.shopName,
      status: storeConnections.status,
      accessTokenEnc: storeConnections.accessTokenEnc,
      connectedAt: storeConnections.connectedAt,
    })
    .from(storeConnections)
    .where(
      and(
        inArray(storeConnections.marketplace, [...marketplaces]),
        inArray(storeConnections.status, ["connected", ...STATUSES_WITHOUT_ACCESS]),
      ),
    )
    .orderBy(asc(storeConnections.id));
}

/** One store the periodic order check reads, as `listOrderCheckStores` returns it. */
export type OrderCheckStore = Awaited<ReturnType<typeof listOrderCheckStores>>[number];

/** Most order numbers looked up at once: a marketplace read returns at most 1000. */
const MAX_LOOKUP_IDS = 1000;

/**
 * The status of each of the store's orders among the given numbers, in one query; a number the
 * store does not have is absent from the map.
 *
 * @throws {RangeError} When more than 1000 numbers are asked at once.
 */
export async function findStoreOrderStatuses(
  database: Database,
  storeConnectionId: string,
  externalOrderIds: readonly string[],
): Promise<Map<string, (typeof orders.$inferSelect)["status"]>> {
  if (externalOrderIds.length === 0) {
    return new Map();
  }
  if (externalOrderIds.length > MAX_LOOKUP_IDS) {
    throw new RangeError(
      `At most ${MAX_LOOKUP_IDS} order numbers per lookup, got ${externalOrderIds.length}`,
    );
  }
  const rows = await database
    .select({ externalOrderId: orders.externalOrderId, status: orders.status })
    .from(orders)
    .where(
      and(
        eq(orders.storeConnectionId, storeConnectionId),
        inArray(orders.externalOrderId, [...externalOrderIds]),
      ),
    );
  return new Map(rows.map((row) => [row.externalOrderId, row.status]));
}
