import { asc, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { shipmentEvents } from "../schema/index.ts";

/**
 * Every event of the given parcels, oldest first, for the tracking history. The caller already
 * scoped the parcel ids to who is reading (tenant, supplier or staff), so this reads by id only.
 */
export async function listShipmentEventsFor(database: Database, shipmentIds: readonly string[]) {
  if (shipmentIds.length === 0) {
    return [];
  }
  return database
    .select({
      id: shipmentEvents.id,
      shipmentId: shipmentEvents.shipmentId,
      status: shipmentEvents.status,
      actor: shipmentEvents.actor,
      note: shipmentEvents.note,
      createdAt: shipmentEvents.createdAt,
    })
    .from(shipmentEvents)
    .where(inArray(shipmentEvents.shipmentId, [...shipmentIds]))
    .orderBy(asc(shipmentEvents.createdAt));
}
