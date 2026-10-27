import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { CarrierTrackingResult } from "./carrier-tracking";
import type { TrackingStep } from "./parcel-history";
import type { TrackingExplanation } from "./tracking-explanation";

/** One parcel of the reseller's order as the tracking screen shows it. */
export interface TrackedParcelView {
  shipmentId: string;
  orderId: string;
  externalOrderId: string;
  storeName: string;
  supplierName: string;
  catalogKind: "seller" | "supplier";
  status: FulfillmentStatus;
  carrier: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  /** Null when there is no code to read, or it is not a Correios code. */
  carrierTracking: CarrierTrackingResult | null;
  explanation: TrackingExplanation;
  /** SellBridge's steps for this parcel (messages left out), oldest first. */
  steps: TrackingStep[];
}

/**
 * What a search finds: the reseller's parcels; a Correios code read straight from the carrier
 * ("manual"); no forwarded order with that number; or text that is not a valid code.
 */
export type TrackingSearchResult =
  | { kind: "parcels"; parcels: TrackedParcelView[] }
  | {
      kind: "manual";
      code: string;
      carrierTracking: CarrierTrackingResult;
      /** Only when the carrier answered: without its events there is nothing to explain. */
      explanation: TrackingExplanation | null;
    }
  | { kind: "order_not_found" }
  | { kind: "invalid_code" };
