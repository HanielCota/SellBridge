import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { and, eq } from "drizzle-orm";
import type { Database, Transaction } from "../client.ts";
import { orders, orderShipments, shipmentEvents, suppliers } from "../schema/index.ts";

/** Restart the owner's preparation without issuing any supplier access or new stock movement. */
export async function restartSellerShipment(
  database: Database,
  tenantId: string,
  shipmentId: string,
) {
  return database.transaction(async (transaction) => {
    const [candidate] = await transaction
      .select({ orderId: orderShipments.orderId })
      .from(orderShipments)
      .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
      .where(
        and(
          eq(orderShipments.id, shipmentId),
          eq(orderShipments.tenantId, tenantId),
          eq(suppliers.catalogKind, "seller"),
          eq(suppliers.ownerTenantId, tenantId),
        ),
      );
    if (candidate === undefined) throw notFoundError("Own shipment not found.");
    const [order] = await transaction
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, candidate.orderId), eq(orders.tenantId, tenantId)))
      .for("update");
    if (order?.status !== "paid") throw conflictError("Only paid orders can restart preparation.");
    const [shipment] = await transaction
      .update(orderShipments)
      .set({
        status: "accepted",
        updatedAt: new Date(),
        supplierTokenHash: null,
        supplierTokenExpiresAt: null,
        carrier: null,
        trackingCode: null,
        trackingUrl: null,
      })
      .where(
        and(
          eq(orderShipments.id, shipmentId),
          eq(orderShipments.tenantId, tenantId),
          eq(orderShipments.status, "cancelled"),
        ),
      )
      .returning({ id: orderShipments.id });
    if (shipment === undefined) throw conflictError("Only stopped preparation can be restarted.");
    await recordRestart(transaction, shipmentId);
    return { shipmentId };
  });
}

async function recordRestart(transaction: Transaction, shipmentId: string) {
  await transaction.insert(shipmentEvents).values([
    {
      shipmentId,
      status: "forwarded",
      actor: SHIPMENT_ACTORS.reseller,
      note: "Own preparation restarted by the seller.",
    },
    {
      shipmentId,
      status: "accepted",
      actor: SHIPMENT_ACTORS.reseller,
      note: "Ready for the seller to prepare and ship.",
    },
  ]);
}
