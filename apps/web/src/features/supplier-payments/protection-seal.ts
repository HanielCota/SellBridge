import type { SupplierPaymentBadge } from "@sellbridge/shared/shipment-payments";

/**
 * Whether the order still promises that the money is held until the delivery: only for an Asaas
 * payment that did not come back, and not once Asaas released a refused refund to the supplier.
 */
export function showsProtectionSeal(view: {
  protectedPayment: boolean;
  badge: SupplierPaymentBadge;
  manualRefund: { releasedToSupplier: boolean } | null;
}): boolean {
  if (!view.protectedPayment || view.badge.kind === "refunded") {
    return false;
  }
  return view.manualRefund?.releasedToSupplier !== true;
}
