import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { SupplierScanMode } from "@sellbridge/shared/supplier-panel-orders-schema";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";

/** What a scan knows of the parcel it found. */
export interface ScannedShipment {
  status: FulfillmentStatus;
  orderStatus: string;
  carrier: string | null;
  trackingCode: string | null;
}

/** The steps a scan writes, in order, or why it writes none. */
export type ScanPlan =
  { kind: "steps"; steps: FulfillmentStatus[] } | { kind: "refused"; reason: string };

const STEPS_TO_READY: Partial<Record<FulfillmentStatus, FulfillmentStatus[]>> = {
  accepted: ["picking", "ready"],
  picking: ["ready"],
  ready: [],
};

/**
 * What a scan does to the parcel. Steps only move forward, one at a time, as the panel's own
 * buttons do: "picking" brings an accepted parcel to "Pronto para envio"; "dispatch" also sends
 * it, with the carrier and tracking code it already has. A parcel not yet accepted is refused:
 * accepting stays a decision of its own.
 */
export function scanPlan(shipment: ScannedShipment, mode: SupplierScanMode): ScanPlan {
  if (isShippingBlocked(shipment.orderStatus)) {
    return {
      kind: "refused",
      reason: "Venda sem liberação para envio: separe e fale com o revendedor.",
    };
  }
  const toReady = STEPS_TO_READY[shipment.status];
  if (toReady === undefined) {
    return { kind: "refused", reason: "Aceite o pedido antes de conferir." };
  }
  if (mode === "picking") {
    return { kind: "steps", steps: toReady };
  }
  if ((shipment.carrier ?? "") === "" || (shipment.trackingCode ?? "") === "") {
    return {
      kind: "refused",
      reason: "Falta o rastreio: abra o pedido e informe a transportadora e o código.",
    };
  }
  return { kind: "steps", steps: [...toReady, "shipped"] };
}
