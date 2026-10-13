import { applyMarketplaceShipment, updateShipment } from "@sellbridge/database/repositories";
import type { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import type { z } from "zod";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";
import { loadMarketplaceShipping } from "./marketplace.server";

type ShipmentUpdate = z.infer<typeof shipmentUpdateSchema>;
type ShipmentScope = Parameters<typeof updateShipment>[2];

/*
 * A shipment that leaves (or comes back) moves supplier stock, so every write here asks the
 * worker to push the new count to the marketplaces right away.
 */

/** Shipment status from the reseller (tenant) or the supplier link (token). */
export async function writeShipmentUpdate(update: ShipmentUpdate, scope: ShipmentScope) {
  const result = await updateShipment(database, update, scope);
  await requestStockSync("stock.sync_deferred");
  return result;
}

/** Pulls the Mercado Livre shipment and applies it to the order. */
export async function refreshMarketplaceShipment(tenantId: string, orderId: string) {
  const shipping = await loadMarketplaceShipping(tenantId, orderId);
  await applyMarketplaceShipment(database, tenantId, orderId, shipping);
  await requestStockSync("stock.sync_deferred");
}
