import { z } from "zod";
import { pageNumberSchema, searchQuery } from "./common.ts";
import { optionalParameter, withFallback } from "./fallback.ts";

/**
 * The staff "Envios" filters. `late`: the supplier missed the dispatch deadline, or the parcel
 * passed its delivery estimate; `problem`: the carrier could not deliver it, or it came back.
 */
export const STAFF_SHIPMENT_GROUPS = ["all", "late", "problem", "transit", "delivered"] as const;
export type StaffShipmentGroup = (typeof STAFF_SHIPMENT_GROUPS)[number];

export const STAFF_SHIPMENT_GROUP_LABELS: Record<StaffShipmentGroup, string> = {
  all: "Todos",
  late: "Atrasados",
  problem: "Com problema",
  transit: "Em trânsito",
  delivered: "Entregues",
};

export const STAFF_SHIPMENTS_PAGE_SIZE = 20;

export const staffShipmentSearchSchema = z.object({
  group: withFallback(z.enum(STAFF_SHIPMENT_GROUPS).default("all"), "all"),
  query: optionalParameter(searchQuery()),
  page: withFallback(pageNumberSchema.default(1), 1),
  shipment: optionalParameter(z.uuid()),
});
export type StaffShipmentSearch = z.infer<typeof staffShipmentSearchSchema>;
