import { z } from "zod";
import type { StoreCredentials } from "../types.ts";
import { type MercadoLivreContext, requestJson } from "./client.ts";
import { externalIdSchema } from "./schemas.ts";

const REAIS_TO_CENTS = 100;

/**
 * `GET /shipments/{id}/costs` (header `x-format-new: true`): `senders[].cost` is the final cost
 * of the shipment each seller pays, after discounts; one shipment may carry several sellers'
 * items. Official "Gerenciamento de envios" page, section "Costs", read 17/11/2026.
 */
const shipmentCostsSchema = z.object({
  senders: z.array(z.object({ user_id: externalIdSchema, cost: z.number().nonnegative() })),
});

/**
 * What the store pays Mercado Livre to ship this sale, in cents; null when the shipment names no
 * cost for the store (not created yet, or another seller's).
 */
export async function readSellerShippingCents(
  context: MercadoLivreContext,
  store: StoreCredentials,
  shipmentId: string,
): Promise<number | null> {
  const costs = await requestJson(context, {
    schema: shipmentCostsSchema,
    path: `/shipments/${encodeURIComponent(shipmentId)}/costs`,
    init: { accessToken: store.accessToken, headers: { "x-format-new": "true" } },
  });
  const sender = costs.senders.find(
    (candidate) => String(candidate.user_id) === store.externalShopId,
  );
  if (sender === undefined) {
    return null;
  }
  return Math.round(sender.cost * REAIS_TO_CENTS);
}
