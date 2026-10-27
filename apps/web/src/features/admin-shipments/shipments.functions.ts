import { countStaffShipmentsByGroup, listStaffShipments } from "@sellbridge/database/repositories";
import { staffShipmentSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";
import { trackedParcelViews } from "@/features/tracking/order-tracking.server";

/** `/admin/envios`: every customer's parcels, for the team answering "cadê meu pedido?". */
export const listStaffShipmentsFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("shipments.view")])
  .validator(staffShipmentSearchSchema.pick({ group: true, query: true, page: true }))
  .handler(async ({ data }) => await listStaffShipments(database, data));

export const countStaffShipmentsFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("shipments.view")])
  .handler(async () => await countStaffShipmentsByGroup(database));

/** One parcel with the same tracking card the reseller sees, read-only for the team. */
export const staffParcelTrackingFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("shipments.view")])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(async ({ data }) => {
    const parcels = await trackedParcelViews(
      { staff: true },
      { kind: "shipment", shipmentId: data.shipmentId },
    );
    return parcels[0] ?? null;
  });
