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

/**
 * The seal's words: before the delivery the money waits for it; once the parcel was cancelled or
 * came back there is no delivery to wait for, only the money still held until it is settled.
 */
export function protectionSealText(badge: SupplierPaymentBadge): string {
  if (badge.kind === "refunding" || badge.kind === "held") {
    return "Pagamento protegido: o valor está guardado no Asaas e não foi para o fornecedor";
  }
  return "Pagamento protegido: liberado ao fornecedor só depois da entrega";
}
