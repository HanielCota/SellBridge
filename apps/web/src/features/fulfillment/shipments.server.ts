import { randomUUID } from "node:crypto";
import { applyMarketplaceShipment, updateShipment } from "@sellbridge/database/repositories";
import type { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import type { z } from "zod";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";
import { loadMarketplaceShipping } from "./marketplace.server";
import { noticeOrderMessage } from "./order-message-notice.server";

type ShipmentUpdate = z.infer<typeof shipmentUpdateSchema>;
type ShipmentScope = Parameters<typeof updateShipment>[2];

/*
 * A shipment that leaves (or comes back) moves supplier stock, so every status change here asks
 * the worker to push the new count to the marketplaces right away. An occurrence note does not.
 */

/**
 * Shipment status from the reseller (tenant) or the supplier (link token or panel). A note that
 * keeps the status is a message of "Mensagens do pedido", and the other side is told about it.
 */
export async function writeShipmentUpdate(update: ShipmentUpdate, scope: ShipmentScope) {
  const result = await updateShipment(database, update, scope);
  if (result.statusChanged) await requestStockSync("stock.sync_deferred");
  if (!result.statusChanged && update.note.trim() !== "") {
    // Not awaited: the message is saved, and an e-mail must not hold the person who wrote it.
    void noticeOrderMessage({
      shipmentId: update.shipmentId,
      author: "tenantId" in scope ? "reseller" : "supplier",
      messageKey: randomUUID(),
    });
  }
  return result;
}

/** Pulls the Mercado Livre shipment and applies it to the order. */
export async function refreshMarketplaceShipment(tenantId: string, orderId: string) {
  const shipping = await loadMarketplaceShipping(tenantId, orderId);
  await applyMarketplaceShipment(database, tenantId, orderId, shipping);
  await requestStockSync("stock.sync_deferred");
}
