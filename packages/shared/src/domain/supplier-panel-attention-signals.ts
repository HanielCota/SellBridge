import { SHIPMENT_ACTORS } from "../schemas/fulfillment.ts";
import { isForwardEmailFailureNote } from "./forward-notes.ts";
import { shipmentDeadlines, shipmentDelay, type ShipmentTiming } from "./shipment-delay.ts";

/**
 * The raw signals behind the supplier's "Precisa de você" queue, and how each one is read.
 * Deadlines come from `shipment-delay.ts`, so the queue, the orders list and the reseller's
 * screens agree on what is late.
 */

/** A parcel still with the supplier, as the home page reads it. */
export interface OpenShipmentSignal extends ShipmentTiming {
  shipmentId: string;
  orderId: string;
  externalOrderId: string;
  /** Notes SellBridge left on the parcel since its latest forward (failed e-mail, label...). */
  systemNotes: readonly string[];
}

/** A product of the supplier, with what is left to sell and how many live listings show it. */
export interface StockSignal {
  productId: string;
  title: string;
  sku: string;
  /** Shelf stock minus what paid orders hold; zero or less means nothing left to sell. */
  availableStock: number;
  /** Published listings (every reseller, every store) still showing the product. */
  activeListings: number;
}

/** A product the platform's review refused: it stays out of the catalog until fixed and sent again. */
export interface RejectedProductSignal {
  productId: string;
  title: string;
  sku: string;
  /** Field of the first rejection reason, where "Corrigir produto" opens the form. */
  firstReasonField: string | null;
}

/** Hours before the accept time when the queue starts warning. */
export const ACCEPT_DUE_SOON_HOURS = 4;
/** Hours before the dispatch deadline when the queue starts warning. */
export const DISPATCH_DUE_SOON_HOURS = 24;

const HOUR_MILLISECONDS = 3_600_000;

export type ParcelState = "accept_overdue" | "dispatch_overdue" | "accept_soon" | "dispatch_soon";

function dueWithin(deadline: Date | null, hours: number, now: Date): boolean {
  if (deadline === null) {
    return false;
  }
  return deadline.getTime() - now.getTime() <= hours * HOUR_MILLISECONDS;
}

/** What the supplier must do about a parcel now, or null while it has time. */
export function parcelState(signal: OpenShipmentSignal, now: Date): ParcelState | null {
  const delay = shipmentDelay(signal, now);
  if (delay === "accept_overdue" || delay === "dispatch_overdue") {
    return delay;
  }
  const deadlines = shipmentDeadlines(signal);
  if (dueWithin(deadlines.acceptBy, ACCEPT_DUE_SOON_HOURS, now)) {
    return "accept_soon";
  }
  if (dueWithin(deadlines.dispatchBy, DISPATCH_DUE_SOON_HOURS, now)) {
    return "dispatch_soon";
  }
  return null;
}

export type DeliveryFailure = "email" | "label";

/**
 * Reads a SellBridge note as a failure the supplier should know about. The failed e-mail is the
 * exact note the forward writes (`forward-notes.ts`). No code writes a label failure yet, so
 * that one is still read by its wording; any other note is not a failure.
 */
export function deliveryFailureOf(note: string): DeliveryFailure | null {
  if (isForwardEmailFailureNote(note)) {
    return "email";
  }
  const text = note.toLowerCase();
  if (text.includes("etiqueta") && (text.includes("falh") || text.includes("não foi"))) {
    return "label";
  }
  return null;
}

/** The actor SellBridge writes its own notes as; the repository filters on it. */
export const SYSTEM_NOTE_ACTOR = SHIPMENT_ACTORS.sellbridge;

/**
 * Failures still worth a line: a failed e-mail stops mattering once the supplier accepted
 * (it clearly has the order); a failed label matters until the parcel leaves.
 */
export function deliveryFailures(signal: OpenShipmentSignal): DeliveryFailure[] {
  const found = signal.systemNotes
    .map((note) => deliveryFailureOf(note))
    .filter((failure) => failure !== null)
    .filter((failure) => failure === "label" || signal.status === "forwarded");
  return [...new Set(found)];
}

/** Products that ran out while live listings still sell them: the overselling risk. */
export function outOfStockListed(signals: readonly StockSignal[]): StockSignal[] {
  return signals.filter((signal) => signal.availableStock <= 0 && signal.activeListings > 0);
}
