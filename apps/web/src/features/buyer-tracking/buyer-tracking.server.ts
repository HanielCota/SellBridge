import { createHmac } from "node:crypto";
import { getBuyerTracking, saveBuyerTrackingToken } from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { appOriginFor } from "@/lib/server/app-origin";
import { carrierEventsOf } from "@/features/tracking/carrier-tracking";
import { correiosCodeOf, trackCode } from "@/features/tracking/order-tracking.server";
import { buyerTrackingView, type BuyerTrackingView } from "./buyer-tracking-view";

/**
 * The same token every time for a parcel (an HMAC of its id with the server secret), so a link
 * the reseller sends again is the one the buyer already has. 64 hex characters, like the
 * supplier link's token.
 */
function buyerTrackingToken(shipmentId: string): string {
  return createHmac("sha256", environment.BETTER_AUTH_SECRET)
    .update(`buyer-tracking:${shipmentId}`)
    .digest("hex");
}

/** The reseller's link for the buyer of one of its parcels. */
export async function issueBuyerTrackingLink(input: {
  tenantId: string;
  shipmentId: string;
  requestUrl: string;
}): Promise<{ url: string }> {
  const token = buyerTrackingToken(input.shipmentId);
  await saveBuyerTrackingToken(database, {
    tenantId: input.tenantId,
    shipmentId: input.shipmentId,
    token,
  });
  return { url: new URL(`/rastreio/${token}`, appOriginFor(input.requestUrl)).toString() };
}

/** The buyer's page; null for a token no parcel has (never says which part was wrong). */
export async function loadBuyerTracking(token: string): Promise<BuyerTrackingView | null> {
  const parcel = await getBuyerTracking(database, token);
  if (parcel === null) {
    return null;
  }
  const code = correiosCodeOf(parcel);
  const tracked = code === null ? null : await trackCode(code, parcel.shippedAt);
  return buyerTrackingView(parcel, carrierEventsOf(tracked) ?? []);
}
