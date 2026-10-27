import { type CarrierTrackingProviderName, type CarrierTrackingResult } from "./carrier-tracking";

export interface TrackParcelRequest {
  /** Already normalized (`normalizeTrackingInput`). */
  code: string;
  /** When the supplier marked the parcel as sent; null for a code typed by hand. */
  handedOverAt: Date | null;
}

/** The seam between SellBridge and a carrier's tracking. */
export interface CarrierTrackingProvider {
  name: CarrierTrackingProviderName;
  trackParcel(request: TrackParcelRequest): Promise<CarrierTrackingResult>;
}

/** No carrier connected yet: the screen says so instead of showing an empty history. */
const offProvider: CarrierTrackingProvider = {
  name: "off",
  trackParcel: async () => ({ state: "not_connected" }),
};

/*
 * The Correios provider can be added here. It must:
 * - call the API with `AbortSignal.timeout` on every request;
 * - retry with backoff only on transient errors (network, 429, 5xx), never on 4xx;
 * - parse the answer with `carrierTrackingResultSchema` (map the Correios event codes to
 *   `CARRIER_EVENT_KINDS`) and return `unavailable` or a typed AppError when it fails;
 * - read its credentials from the validated server environment, never from code.
 */
export function createCarrierTrackingProvider(
  _name: CarrierTrackingProviderName,
): CarrierTrackingProvider {
  return offProvider;
}
