/** Parcels in these states get no NF-e: the sale did not go ahead. */
export const UNINVOICED_SHIPMENT_STATUSES = ["cancelled", "returned", "not_delivered"] as const;
export const UNINVOICED_ORDER_STATUSES = ["pending", "cancelled", "returned"] as const;
