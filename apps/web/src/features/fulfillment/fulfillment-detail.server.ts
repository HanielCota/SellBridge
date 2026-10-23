import { getFulfillmentDetail } from "@sellbridge/database/repositories";
import { openShippingAddress } from "@sellbridge/marketplaces";
import { database } from "@/lib/server/database";
import { tokenCipher } from "@/lib/server/marketplaces";

/**
 * The operations dialog's order. The encrypted address never leaves the server: it is opened
 * only while the order still waits to be forwarded, to fill the forward form. Once the parcels
 * exist, the address they carry is the record and this one stays closed.
 */
export async function loadFulfillmentDetail(tenantId: string, orderId: string) {
  const detail = await getFulfillmentDetail(database, tenantId, orderId);
  const { shippingAddressEnc, ...order } = detail.order;
  const awaitsForwarding = detail.shipments.length === 0 && order.status === "paid";
  const marketplaceAddress = awaitsForwarding
    ? openShippingAddress(tokenCipher, shippingAddressEnc)
    : null;
  return { ...detail, order: { ...order, marketplaceAddress } };
}
