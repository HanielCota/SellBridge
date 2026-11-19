import { sql, type SQL } from "drizzle-orm";
import { isCountedOrder } from "./counted-orders.ts";

/**
 * The shipping the seller paid on the order of the table aliased `alias`, counted once per cart.
 * Mercado Livre ships a cart (`marketplace_pack_id`) as one shipment, and each of its orders
 * reports that shipment's whole cost; only the cart's first sale (lowest order number among its
 * counted orders) keeps it, the others count zero.
 */
export function sellerShippingOnce(alias: string): SQL {
  const order = sql.raw(alias);
  return sql`case
    when ${order}.marketplace_pack_id is null then coalesce(${order}.seller_shipping_cents, 0)
    when ${order}.external_order_id = (
      select min(cart.external_order_id) from orders cart
      where cart.tenant_id = ${order}.tenant_id
        and cart.store_connection_id = ${order}.store_connection_id
        and cart.marketplace_pack_id = ${order}.marketplace_pack_id
        and ${isCountedOrder(sql.raw("cart.status"))}
    ) then coalesce(${order}.seller_shipping_cents, 0)
    else 0
  end`;
}
