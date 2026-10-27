import type { FulfillmentStatus } from "@sellbridge/shared/schemas";

/** Parcels the supplier has nothing more to do or see for. */
const LINK_CLOSING_STATUSES: readonly FulfillmentStatus[] = ["delivered", "returned"];

/**
 * A delivered or returned parcel needs nothing more from the supplier: its link stops working
 * instead of showing the buyer's address and label for the rest of its 30 days. A cancelled one
 * keeps it, so the supplier still sees the cancellation it made; re-forwarding replaces it.
 */
export function linkFieldsFor(status: FulfillmentStatus) {
  return LINK_CLOSING_STATUSES.includes(status)
    ? { supplierTokenHash: null, supplierTokenExpiresAt: null }
    : {};
}
