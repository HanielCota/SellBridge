import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { StatusTone } from "@/components/data/tone-status";
import {
  splitShipmentEvents,
  type ShipmentEventRecord,
} from "@/features/fulfillment/order-messages";
import { FULFILLMENT_TONES, shipmentStatusLabel } from "@/features/fulfillment/shipment-timeline";
import {
  carrierEventsOldestFirst,
  type CarrierEventKind,
  type CarrierTrackingEvent,
} from "./carrier-tracking";

/** A step SellBridge recorded for a parcel (not a message): who moved it and when. */
export interface TrackingStep {
  status: FulfillmentStatus;
  actor: string;
  note: string;
  createdAt: Date;
}

/**
 * Each parcel's steps from its raw events, messages left out (they belong to "Mensagens do
 * pedido"). The reader does not change which events are steps, only how messages are signed.
 */
export function trackingStepsByShipment(
  events: readonly (ShipmentEventRecord & { shipmentId: string })[],
): ReadonlyMap<string, TrackingStep[]> {
  const byShipment = new Map<string, (ShipmentEventRecord & { shipmentId: string })[]>();
  for (const event of events) {
    byShipment.set(event.shipmentId, [...(byShipment.get(event.shipmentId) ?? []), event]);
  }
  return new Map(
    [...byShipment].map(([shipmentId, group]) => [
      shipmentId,
      splitShipmentEvents(group, "reseller").steps.map((step) => ({
        status: step.status,
        actor: step.actor,
        note: step.note,
        createdAt: new Date(step.createdAt),
      })),
    ]),
  );
}

/** One line of "Histórico do envio": a SellBridge step or a carrier scan, newest first. */
export interface ParcelHistoryEntry {
  key: string;
  at: Date;
  label: string;
  detail: string | null;
  tone: StatusTone;
}

export const CARRIER_EVENT_TONES: Record<CarrierEventKind, StatusTone> = {
  posted: "info",
  in_transit: "info",
  out_for_delivery: "info",
  delivery_failed: "warning",
  awaiting_pickup: "warning",
  returning: "danger",
  delivered: "success",
};

function stepDetail(step: TrackingStep): string {
  const note = step.note.trim();
  return note === "" ? `por ${step.actor}` : `por ${step.actor} · ${note}`;
}

function stepEntry(step: TrackingStep, index: number, catalogKind: "seller" | "supplier") {
  return {
    key: `step-${index}-${step.createdAt.getTime()}`,
    at: step.createdAt,
    label: shipmentStatusLabel(step.status, catalogKind),
    detail: stepDetail(step),
    tone: FULFILLMENT_TONES[step.status],
  };
}

function carrierEntry(event: CarrierTrackingEvent, index: number): ParcelHistoryEntry {
  return {
    key: `carrier-${index}-${event.at.getTime()}`,
    at: event.at,
    label: event.description,
    detail: event.place,
    tone: CARRIER_EVENT_TONES[event.kind],
  };
}

/**
 * SellBridge's steps and the carrier's scans in one history, newest first. At the same instant
 * the carrier's scan reads first: it is what happened to the parcel after the step was saved.
 */
export function parcelHistory(input: {
  steps: readonly TrackingStep[];
  carrierEvents: readonly CarrierTrackingEvent[];
  catalogKind: "seller" | "supplier";
}): ParcelHistoryEntry[] {
  const steps = input.steps.map((step, index) => ({
    entry: stepEntry(step, index, input.catalogKind),
    order: index,
  }));
  const scans = carrierEventsOldestFirst(input.carrierEvents).map((event, index) => ({
    entry: carrierEntry(event, index),
    order: input.steps.length + index,
  }));
  return [...steps, ...scans]
    .toSorted(
      (left, right) =>
        right.entry.at.getTime() - left.entry.at.getTime() || right.order - left.order,
    )
    .map(({ entry }) => entry);
}

export type ProgressState = "done" | "current" | "todo" | "problem";

export interface ProgressStep {
  label: string;
  state: ProgressState;
}

const PROGRESS_LABELS = ["Encaminhado", "Aceito", "Em separação", "Enviado", "Entregue"] as const;

/** How far along the five steps a status is; "ready" still sits on "Em separação". */
const PROGRESS_REACHED: Record<FulfillmentStatus, number | null> = {
  forwarded: 0,
  accepted: 1,
  picking: 2,
  ready: 2,
  shipped: 3,
  delivered: 4,
  not_delivered: 3,
  returned: 3,
  cancelled: null,
};

/** The last step, replaced when the delivery went wrong. */
const PROBLEM_LABELS: Partial<Record<FulfillmentStatus, string>> = {
  not_delivered: "Não entregue",
  returned: "Devolvido",
};

/** The five steps of a parcel; null for a cancelled one, which has no way forward to show. */
export function parcelProgress(status: FulfillmentStatus): ProgressStep[] | null {
  const reached = PROGRESS_REACHED[status];
  if (reached === null) {
    return null;
  }
  const problem = PROBLEM_LABELS[status];
  return PROGRESS_LABELS.map((label, index) => {
    if (problem !== undefined && index === reached + 1) {
      return { label: problem, state: "problem" };
    }
    if (index < reached) {
      return { label, state: "done" };
    }
    if (index === reached) {
      return { label, state: "current" };
    }
    return { label, state: "todo" };
  });
}
