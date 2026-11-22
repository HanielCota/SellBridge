import type { FeeChannel } from "@sellbridge/shared/channel-fees";
import { saleCancelledContent } from "@sellbridge/shared/notification-events";
import { SUPPLIER_QUEUE_STATUSES } from "@sellbridge/shared/supplier-panel-orders";
import { SHIPMENT_ACTORS } from "@sellbridge/shared/schemas";
import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "../client.ts";
import { orderShipments, shipmentEvents, storeConnections, suppliers } from "../schema/index.ts";
import { notifyWorkspace } from "./notification-producers.ts";

/** Where the sale was cancelled, as the note reads it: "no Mercado Livre", "na Shopee". */
const CHANNEL_PLACES: Readonly<Record<FeeChannel, string>> = {
  mercado_livre: "no Mercado Livre",
  tiktok_shop: "no TikTok Shop",
  shopee: "na Shopee",
};

function isFeeChannel(marketplace: string): marketplace is FeeChannel {
  return Object.hasOwn(CHANNEL_PLACES, marketplace);
}

/** Where the sale was cancelled, or null for a channel without a name for the supplier. */
function channelPlaceOf(marketplace: string): string | null {
  return isFeeChannel(marketplace) ? CHANNEL_PLACES[marketplace] : null;
}

/** The history note the supplier and the reseller read on the cancelled parcel. */
export function saleCancelledNote(channelPlace: string | null): string {
  const where = channelPlace === null ? "" : ` ${channelPlace}`;
  return `Venda cancelada${where}. Não envie o produto; se já separou, devolva ao estoque.`;
}

/** Tells the supplier's panel workspace, once per parcel; a directory supplier has none. */
async function noticeSupplier(
  transaction: Transaction,
  input: {
    shipmentId: string;
    supplierId: string;
    externalOrderId: string;
    channelPlace: string | null;
  },
): Promise<void> {
  const [supplier] = await transaction
    .select({ organizationId: suppliers.organizationId, catalogKind: suppliers.catalogKind })
    .from(suppliers)
    .where(eq(suppliers.id, input.supplierId));
  if (supplier?.organizationId == null || supplier.catalogKind !== "supplier") {
    return;
  }
  await notifyWorkspace(transaction, {
    tenantId: supplier.organizationId,
    event: "shipment_problem",
    dedupeKey: `shipment:${input.shipmentId}:sale_cancelled`,
    content: saleCancelledContent({
      externalOrderId: input.externalOrderId,
      channelPlace: input.channelPlace,
    }),
  });
}

/**
 * The marketplace cancelled the sale: every parcel still in a supplier's queue (not yet shipped)
 * is cancelled too, so it leaves the queue, its deadline stops and no penalty can come of it.
 * The cancellation is SellBridge's, not the reseller's, so a paid parcel follows the automatic
 * refund for cancelled parcels. A parcel already shipped is left to its tracking: it comes back
 * as a return. Runs inside the order's transaction; a repeated notice finds nothing to cancel.
 */
export async function cancelQueuedParcelsOfCancelledSale(
  transaction: Transaction,
  order: { id: string; tenantId: string; storeConnectionId: string; externalOrderId: string },
): Promise<number> {
  const parcels = await transaction
    .select({ id: orderShipments.id, supplierId: orderShipments.supplierId })
    .from(orderShipments)
    .where(
      and(
        eq(orderShipments.orderId, order.id),
        eq(orderShipments.tenantId, order.tenantId),
        inArray(orderShipments.status, [...SUPPLIER_QUEUE_STATUSES]),
      ),
    )
    .for("update");
  if (parcels.length === 0) {
    return 0;
  }
  const [store] = await transaction
    .select({ marketplace: storeConnections.marketplace })
    .from(storeConnections)
    .where(eq(storeConnections.id, order.storeConnectionId));
  const channelPlace = store === undefined ? null : channelPlaceOf(store.marketplace);
  const now = new Date();
  for (const parcel of parcels) {
    await transaction
      .update(orderShipments)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(orderShipments.id, parcel.id));
    await transaction.insert(shipmentEvents).values({
      shipmentId: parcel.id,
      status: "cancelled",
      actor: SHIPMENT_ACTORS.sellbridge,
      note: saleCancelledNote(channelPlace),
    });
    await noticeSupplier(transaction, {
      shipmentId: parcel.id,
      supplierId: parcel.supplierId,
      externalOrderId: order.externalOrderId,
      channelPlace,
    });
  }
  return parcels.length;
}
