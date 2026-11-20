import { countStaffShipmentsByGroup, listStaffShipments } from "@sellbridge/database/repositories";
import { freeText, staffShipmentSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";
import { trackedParcelViews } from "@/features/tracking/order-tracking.server";
import { loadStaffOnBehalfLabel, releaseStaffOnBehalfLabel } from "./on-behalf-label.server";

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

/** The venda à ordem label of one parcel: why it waits, and its release if the team gave one. */
export const staffOnBehalfLabelFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("shipments.view")])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(
    async ({ context, data }) => await loadStaffOnBehalfLabel(data.shipmentId, context.role),
  );

/** The fewest characters a release reason takes: a word or two says nothing to an audit. */
const MIN_RELEASE_REASON_LENGTH = 10;
const MAX_RELEASE_REASON_LENGTH = 500;

export const releaseOnBehalfLabelFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("shipments.release_label")])
  .validator(
    z.object({
      shipmentId: z.uuid(),
      reason: freeText()
        .trim()
        .min(MIN_RELEASE_REASON_LENGTH, "Escreva o motivo com pelo menos 10 letras.")
        .max(MAX_RELEASE_REASON_LENGTH, "Use no máximo 500 letras no motivo."),
    }),
  )
  .handler(
    async ({ context, data }) =>
      await releaseStaffOnBehalfLabel({ ...data, userId: context.userId, role: context.role }),
  );
