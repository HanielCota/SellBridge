import type { FulfillmentStatus } from "@sellbridge/shared/schemas";

export interface OrderStep {
  key: "received" | "accepted" | "label" | "picked" | "shipped";
  label: string;
  /** When the step happened; null while it has not. */
  at: Date | null;
}

const STATUS_STEPS = [
  { key: "received", label: "Recebido", status: "forwarded" },
  { key: "accepted", label: "Aceito", status: "accepted" },
  { key: "picked", label: "Separado", status: "ready" },
  { key: "shipped", label: "Enviado", status: "shipped" },
] as const satisfies readonly {
  key: OrderStep["key"];
  label: string;
  status: FulfillmentStatus;
}[];

/** The last time the parcel reached `status`: a parcel sent back and forth shows the latest. */
function lastReached(
  events: readonly { status: FulfillmentStatus; createdAt: Date }[],
  status: FulfillmentStatus,
): Date | null {
  return events.findLast((event) => event.status === status)?.createdAt ?? null;
}

/**
 * The supplier's steps for one parcel, in order, each with when it happened: received, accepted,
 * label printed (only on a channel whose label SellBridge prints), picked and shipped.
 */
export function orderSteps(shipment: {
  events: readonly { status: FulfillmentStatus; createdAt: Date }[];
  labelPrintedAt: Date | null;
  hasMarketplaceLabel: boolean;
}): OrderStep[] {
  const steps: OrderStep[] = STATUS_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    at: lastReached(shipment.events, step.status),
  }));
  if (shipment.hasMarketplaceLabel) {
    const label: OrderStep = {
      key: "label",
      label: "Etiqueta impressa",
      at: shipment.labelPrintedAt,
    };
    // Printed after the accept and before the parcel is picked, as the supplier works it.
    return steps.toSpliced(2, 0, label);
  }
  return steps;
}
