import type { FulfillmentStatus } from "@sellbridge/shared/schemas";

/**
 * Whether the order still shows the reseller's sale NF-e card: a cancelled parcel no longer asks
 * for a note nobody will issue, but a note already sent, or one the reseller's Bling already
 * started (its key may never come back once the parcel is cancelled), stays visible, to be
 * cancelled in the ERP.
 */
export function asksForSaleNote(
  parcelStatus: FulfillmentStatus,
  note: { accessKey: string | null; erpStarted: boolean },
): boolean {
  return parcelStatus !== "cancelled" || note.accessKey !== null || note.erpStarted;
}
