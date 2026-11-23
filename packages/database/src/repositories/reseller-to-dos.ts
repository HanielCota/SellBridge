import { and, count, eq, notExists, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { orders, orderShipments, suppliers } from "../schema/index.ts";
import { preparationHold } from "./shipment-timing.ts";

/** What only the reseller can move: paid sales not sent yet, and parcels waiting for its payment. */
export interface ResellerToDos {
  /** Paid orders with no parcel yet: the "Pagos a encaminhar" stage of the orders list. */
  ordersToForward: number;
  /** Parcels the supplier may prepare only after the reseller pays them. */
  supplierPaymentsDue: number;
}

async function countOrdersToForward(database: Database, tenantId: string): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.status, "paid"),
        notExists(
          database
            .select({ id: orderShipments.id })
            .from(orderShipments)
            .where(
              and(eq(orderShipments.orderId, orders.id), eq(orderShipments.tenantId, tenantId)),
            ),
        ),
      ),
    );
  return row?.value ?? 0;
}

async function countSupplierPaymentsDue(database: Database, tenantId: string): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(orderShipments)
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(
      and(
        eq(orderShipments.tenantId, tenantId),
        eq(orders.status, "paid"),
        sql`${preparationHold} = 'payment'`,
      ),
    );
  return row?.value ?? 0;
}

/** The reseller's own pending steps, for the "Precisa de você" panel and the orders list. */
export async function countResellerToDos(
  database: Database,
  tenantId: string,
): Promise<ResellerToDos> {
  const [ordersToForward, supplierPaymentsDue] = await Promise.all([
    countOrdersToForward(database, tenantId),
    countSupplierPaymentsDue(database, tenantId),
  ]);
  return { ordersToForward, supplierPaymentsDue };
}
