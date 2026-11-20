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

/**
 * The sold item owes a stock exit to the supplier's ERP: its units left the shelf (shipped)
 * since the account's `stock_exits_since`, the product is linked, and its parcel's NF-e does not
 * go through SellBridge. Says nothing about whether the exit was posted. Expects the aliases
 * `item` (order_items), `product` (supplier_products), `sale` (orders) and `connection`
 * (supplier_erp_connections).
 */
export const owedStockExit = sql`(
  item.stock_state = 'consumed'
  and product.erp_product_id is not null
  and exists (
    select 1 from order_status_changes as change
    where change.order_id = item.order_id
      and change.status in ('shipped', 'delivered')
      and change.changed_at >= connection.stock_exits_since
  )
  and not exists (${invoicedParcel})
)`;
