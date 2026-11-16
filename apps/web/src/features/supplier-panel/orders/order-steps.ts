import type { FulfillmentStatus } from "@sellbridge/shared/schemas";

export interface OrderStep {
  key: "received" | "invoice" | "accepted" | "label" | "picked" | "shipped";
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

/** Printed after the accept and before the parcel is picked, as the supplier works it. */
function withLabelStep(steps: readonly OrderStep[], printedAt: Date | null): OrderStep[] {
  const accepted = steps.findIndex((step) => step.key === "accepted");
  return steps.toSpliced(accepted + 1, 0, {
    key: "label",
    label: "Etiqueta impressa",
    at: printedAt,
  });
}

/**
 * The supplier's steps for one parcel, in order, each with when it happened: received, note
 * issued (only when the supplier's ERP issues it), accepted, label printed (only on a channel
 * whose label SellBridge prints), picked and shipped.
 */
export function orderSteps(shipment: {
  events: readonly { status: FulfillmentStatus; createdAt: Date }[];
  labelPrintedAt: Date | null;
  hasMarketplaceLabel: boolean;
  /** The parcel's NF-e; null when the supplier's ERP issues none for it. */
  invoice?: { authorizedAt: Date | null } | null;
}): OrderStep[] {
  const statusSteps: OrderStep[] = STATUS_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    at: lastReached(shipment.events, step.status),
  }));
  // The ERP issues the note as soon as the parcel arrives, before the supplier accepts it.
  const steps =
    shipment.invoice === undefined || shipment.invoice === null
      ? statusSteps
      : statusSteps.toSpliced(1, 0, {
          key: "invoice",
          label: "Nota emitida",
          at: shipment.invoice.authorizedAt,
        });
  if (shipment.hasMarketplaceLabel) {
    return withLabelStep(steps, shipment.labelPrintedAt);
  }
  return steps;
}
