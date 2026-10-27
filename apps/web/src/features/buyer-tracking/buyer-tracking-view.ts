import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import type { StatusTone } from "@/components/data/tone-status";
import {
  carrierEventsOldestFirst,
  type CarrierTrackingEvent,
} from "@/features/tracking/carrier-tracking";
import { CARRIER_EVENT_TONES, type ProgressStep } from "@/features/tracking/parcel-history";

/** What the buyer's page receives: nothing about the supplier, the reseller or the address. */
export interface BuyerParcel {
  status: FulfillmentStatus;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  estimatedDeliveryAt: Date | null;
  externalOrderId: string;
  orderedAt: Date;
  storeName: string;
  destination: string | null;
  items: { title: string; quantity: number }[];
  steps: { status: FulfillmentStatus; createdAt: Date }[];
}

export interface BuyerHistoryEntry {
  key: string;
  at: Date;
  label: string;
  place: string | null;
  tone: StatusTone;
}

export interface BuyerTrackingView {
  storeName: string;
  externalOrderId: string;
  orderedAt: Date;
  headline: string;
  subline: string | null;
  progress: ProgressStep[] | null;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  destination: string | null;
  items: { title: string; quantity: number }[];
  history: BuyerHistoryEntry[];
}

const DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});

/**
 * The buyer's words for each status: who prepares the parcel is the store's business, so
 * "aceito pelo fornecedor" reads "Em preparação" and a cancelled parcel is the store's call.
 */
const BUYER_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  forwarded: "Pedido confirmado",
  accepted: "Em preparação",
  picking: "Em preparação",
  ready: "Pronto para envio",
  shipped: "A caminho",
  delivered: "Entregue",
  not_delivered: "Problema na entrega",
  returned: "Voltando para a loja",
  cancelled: "Envio cancelado",
};

const BUYER_STEP_TONES: Record<FulfillmentStatus, StatusTone> = {
  forwarded: "muted",
  accepted: "info",
  picking: "info",
  ready: "info",
  shipped: "info",
  delivered: "success",
  not_delivered: "warning",
  returned: "danger",
  cancelled: "muted",
};

const BUYER_PROGRESS_LABELS = ["Pedido confirmado", "Em preparação", "A caminho", "Entregue"];

const BUYER_PROGRESS_REACHED: Record<FulfillmentStatus, number | null> = {
  forwarded: 0,
  accepted: 1,
  picking: 1,
  ready: 1,
  shipped: 2,
  delivered: 3,
  not_delivered: 2,
  returned: 2,
  cancelled: null,
};

export function buyerProgress(status: FulfillmentStatus): ProgressStep[] | null {
  const reached = BUYER_PROGRESS_REACHED[status];
  if (reached === null) {
    return null;
  }
  return BUYER_PROGRESS_LABELS.map((label, index) => {
    if (index < reached) {
      return { label, state: "done" };
    }
    if (index === reached) {
      return { label, state: status === "not_delivered" ? "problem" : "current" };
    }
    return { label, state: "todo" };
  });
}

function sublineFor(
  parcel: BuyerParcel,
  lastScan: CarrierTrackingEvent | undefined,
): string | null {
  if (parcel.status === "delivered") {
    const deliveredAt = lastScan?.kind === "delivered" ? lastScan.at : null;
    return deliveredAt === null ? null : `Entregue em ${DAY_FORMAT.format(deliveredAt)}`;
  }
  if (parcel.estimatedDeliveryAt === null || parcel.status === "cancelled") {
    return null;
  }
  const estimate = DAY_FORMAT.format(parcel.estimatedDeliveryAt);
  return parcel.estimatedDeliveryAt.getTime() < Date.now()
    ? `A previsão era ${estimate}`
    : `Chega até ${estimate}`;
}

/**
 * Each of the buyer's phrases once, the first time it was reached: "aceito" and "em separação"
 * both read "Em preparação", and a note on the same step adds nothing here.
 */
function firstOfEachLabel(steps: BuyerParcel["steps"]) {
  return steps.filter(
    (step, index) =>
      steps.findIndex(
        (other) => BUYER_STATUS_LABELS[other.status] === BUYER_STATUS_LABELS[step.status],
      ) === index,
  );
}

function buyerHistory(parcel: BuyerParcel, scans: readonly CarrierTrackingEvent[]) {
  const stepEntries = firstOfEachLabel(parcel.steps).map((step, index) => ({
    key: `step-${index}`,
    at: step.createdAt,
    label: BUYER_STATUS_LABELS[step.status],
    place: null,
    tone: BUYER_STEP_TONES[step.status],
  }));
  const scanEntries = scans.map((scan, index) => ({
    key: `scan-${index}`,
    at: scan.at,
    label: scan.description,
    place: scan.place,
    tone: CARRIER_EVENT_TONES[scan.kind],
  }));
  return [...stepEntries, ...scanEntries].toSorted(
    (left, right) => right.at.getTime() - left.at.getTime(),
  );
}

/** The buyer's page from the parcel and the carrier's scans (empty when none could be read). */
export function buyerTrackingView(
  parcel: BuyerParcel,
  carrierEvents: readonly CarrierTrackingEvent[],
): BuyerTrackingView {
  const scans = carrierEventsOldestFirst(carrierEvents);
  return {
    storeName: parcel.storeName,
    externalOrderId: parcel.externalOrderId,
    orderedAt: parcel.orderedAt,
    headline: BUYER_STATUS_LABELS[parcel.status],
    subline: sublineFor(parcel, scans.at(-1)),
    progress: buyerProgress(parcel.status),
    carrier: parcel.carrier,
    trackingCode: parcel.trackingCode,
    trackingUrl: parcel.trackingUrl,
    destination: parcel.destination,
    items: parcel.items,
    history: buyerHistory(parcel, scans),
  };
}
