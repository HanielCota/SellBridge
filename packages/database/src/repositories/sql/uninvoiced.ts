import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/** Parcels in these states get no NF-e: the sale did not go ahead. */
export const UNINVOICED_SHIPMENT_STATUSES = ["cancelled", "returned", "not_delivered"] as const;
export const UNINVOICED_ORDER_STATUSES = ["pending", "cancelled", "returned"] as const;

function notAmong(column: SQLWrapper, statuses: readonly string[]): SQL {
  return sql`${column} not in (${sql.join(
    statuses.map((status) => sql`${status}`),
    sql`, `,
  )})`;
}

/**
 * The invoice job opens a note for the parcel: its supplier turned the NF-e through SellBridge
 * on before the parcel was created, and the sale still goes ahead. Shared by the job and by
 * whatever must know a parcel will be invoiced before its row exists.
 */
export function parcelGetsInvoice(columns: {
  invoiceEnabledAt: SQLWrapper;
  parcelCreatedAt: SQLWrapper;
  parcelStatus: SQLWrapper;
  orderStatus: SQLWrapper;
}): SQL {
  return sql`(${columns.invoiceEnabledAt} is not null
    and ${columns.parcelCreatedAt} >= ${columns.invoiceEnabledAt}
    and ${notAmong(columns.parcelStatus, UNINVOICED_SHIPMENT_STATUSES)}
    and ${notAmong(columns.orderStatus, UNINVOICED_ORDER_STATUSES)})`;
}
