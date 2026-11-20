import { sql } from "drizzle-orm";
import { parcelGetsInvoice } from "./uninvoiced.ts";

/**
 * The item's parcel gets its NF-e through SellBridge: it has the note's row, or the invoice
 * job will open one (it runs every two minutes, so the parcel may ship first). Its sale order
 * lowers Bling's stock, so an exit would lower it twice. Expects the aliases `item`, `product`,
 * `sale` and `connection`.
 */
const invoicedParcel = sql`
  select 1 from order_shipments as parcel
  where parcel.order_id = item.order_id and parcel.supplier_id = product.supplier_id
    and (
      exists (select 1 from shipment_invoices as invoice where invoice.shipment_id = parcel.id)
      or ${parcelGetsInvoice({
        invoiceEnabledAt: sql`connection.invoice_enabled_at`,
        parcelCreatedAt: sql`parcel.created_at`,
        parcelStatus: sql`parcel.status`,
        orderStatus: sql`sale.status`,
      })}
    )
`;

/** The parcel's note has its sale order in Bling, which is what lowers Bling's stock. */
const saleOrderInBling = sql`
  select 1 from order_shipments as parcel
  join shipment_invoices as invoice on invoice.shipment_id = parcel.id
  where parcel.order_id = item.order_id and parcel.supplier_id = product.supplier_id
    and invoice.erp_order_id is not null
`;

/** The item's units left the shelf (shipped) since the account's `stock_exits_since`, linked. */
const shippedLinkedItem = sql`(
  item.stock_state = 'consumed'
  and product.erp_product_id is not null
  and exists (
    select 1 from order_status_changes as change
    where change.order_id = item.order_id
      and change.status in ('shipped', 'delivered')
      and change.changed_at >= connection.stock_exits_since
  )
)`;

/**
 * The sold item owes a stock exit to the supplier's ERP: shipped, linked, and its parcel's NF-e
 * does not go through SellBridge. Says nothing about whether the exit was posted. Expects the
 * aliases `item` (order_items), `product` (supplier_products), `sale` (orders) and
 * `connection` (supplier_erp_connections), as do the fragments below.
 */
export const owedStockExit = sql`(${shippedLinkedItem} and not exists (${invoicedParcel}))`;

/**
 * Bling's balance still counts the shipped item: its exit was not received yet (not tried, still
 * being posted, or blocked), or its parcel's NF-e has no sale order in Bling yet (queued, or
 * stopped for the supplier). Exits the team must check are left out. A note the supplier ended up
 * issuing by hand in Bling keeps counting, on the safe side: selling less, never twice.
 */
export const notYetInBling = sql`(
  ${shippedLinkedItem}
  and (
    (
      not exists (${invoicedParcel})
      and not exists (
        select 1 from erp_stock_exits as posted
        where posted.order_item_id = item.id and posted.status <> 'posting'
      )
    )
    or (exists (${invoicedParcel}) and not exists (${saleOrderInBling}))
  )
)`;
