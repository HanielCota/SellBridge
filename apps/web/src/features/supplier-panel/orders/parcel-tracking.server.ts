import { trackedParcelViews } from "@/features/tracking/order-tracking.server";

/**
 * The parcel as the tracking screen shows it, read as this supplier: null when it is not one of
 * its parcels (the reseller's own stock, or another supplier's).
 */
export async function loadSupplierParcelTracking(input: {
  supplierId: string;
  shipmentId: string;
}) {
  const parcels = await trackedParcelViews(
    { supplierId: input.supplierId },
    { kind: "shipment", shipmentId: input.shipmentId },
  );
  const parcel = parcels[0];
  if (parcel === undefined) {
    return null;
  }
  // The reseller's store stays out of the answer, not only off the screen.
  return { ...parcel, storeName: "" };
}
