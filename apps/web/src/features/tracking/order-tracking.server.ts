import {
  listParcelsInTransit,
  listShipmentEventsFor,
  listTrackedParcels,
  type TrackedParcelFilter,
  type TrackedParcelScope,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { carrierTrackingProviderName } from "@/lib/server/environment-schema";
import {
  carrierEventsOf,
  isCorreiosCode,
  normalizeTrackingInput,
  type CarrierTrackingResult,
} from "./carrier-tracking";
import { lookUpEachCodeOnce } from "./carrier-lookups";
import { createCarrierTrackingProvider } from "./carrier-tracking-provider";
import { trackingStepsByShipment, type TrackingStep } from "./parcel-history";
import { explainTracking } from "./tracking-explanation";
import type { TrackedParcelView, TrackingSearchResult } from "./tracking-views";

const carrierTracking = createCarrierTrackingProvider(carrierTrackingProviderName(environment));

type TrackedParcelRow = Awaited<ReturnType<typeof listTrackedParcels>>[number];

/** A failing carrier never breaks the screen: the parcel shows without its events. */
export async function trackCode(
  code: string,
  handedOverAt: Date | null,
): Promise<CarrierTrackingResult> {
  try {
    return await carrierTracking.trackParcel({ code, handedOverAt });
  } catch (error) {
    logger.warn("tracking.carrier_unavailable", { provider: carrierTracking.name, error });
    return { state: "unavailable" };
  }
}

/** The Correios code a parcel can be read by; null without a code or for another carrier. */
export function correiosCodeOf(row: { trackingCode: string | null }): string | null {
  if (row.trackingCode === null) {
    return null;
  }
  const code = normalizeTrackingInput(row.trackingCode);
  return isCorreiosCode(code) ? code : null;
}

function parcelView(
  row: TrackedParcelRow,
  tracked: CarrierTrackingResult | null,
  steps: TrackingStep[],
  now: Date,
): TrackedParcelView {
  const explanation = explainTracking({
    parcel: row,
    carrierEvents: carrierEventsOf(tracked),
    now,
  });
  return {
    shipmentId: row.shipmentId,
    orderId: row.orderId,
    externalOrderId: row.externalOrderId,
    storeName: row.storeName,
    supplierName: row.supplierName,
    catalogKind: row.catalogKind,
    status: row.status,
    carrier: row.carrier,
    trackingCode: row.trackingCode,
    trackingUrl: row.trackingUrl,
    carrierTracking: tracked,
    explanation,
    steps,
  };
}

/** Each distinct code is read once, a few at a time, then every parcel gets its answer. */
export async function trackedParcelViews(scope: TrackedParcelScope, filter: TrackedParcelFilter) {
  const rows = await listTrackedParcels(database, scope, filter);
  const requests = rows.flatMap((row) => {
    const code = correiosCodeOf(row);
    return code === null ? [] : [{ code, handedOverAt: row.shippedAt }];
  });
  const [answers, events] = await Promise.all([
    lookUpEachCodeOnce(requests, (request) => trackCode(request.code, request.handedOverAt)),
    listShipmentEventsFor(
      database,
      rows.map((row) => row.shipmentId),
    ),
  ]);
  const stepsByShipment = trackingStepsByShipment(events);
  const now = new Date();
  return rows.map((row) => {
    const code = correiosCodeOf(row);
    const tracked = code === null ? null : (answers.get(code) ?? null);
    return parcelView(row, tracked, stepsByShipment.get(row.shipmentId) ?? [], now);
  });
}

export async function orderTracking(
  tenantId: string,
  orderId: string,
): Promise<TrackingSearchResult> {
  const parcels = await trackedParcelViews({ tenantId }, { kind: "order", orderId });
  return { kind: "parcels", parcels };
}

/** Only digits (and a leading "#"): what an order number looks like, never a Correios code. */
const ORDER_NUMBER_PATTERN = /^#?\d+$/;

/**
 * One box for both: the reseller's parcels by tracking code or order number first; else a
 * Correios code is read straight from the carrier ("manual tracking").
 */
export async function searchTracking(
  tenantId: string,
  query: string,
): Promise<TrackingSearchResult> {
  const code = normalizeTrackingInput(query);
  const externalOrderId = query.trim().replace(/^#/, "");
  const parcels = await trackedParcelViews(
    { tenantId },
    {
      kind: "search",
      trackingCode: code,
      externalOrderId,
    },
  );
  if (parcels.length > 0) {
    return { kind: "parcels", parcels };
  }
  if (isCorreiosCode(code)) {
    const tracked = await trackCode(code, null);
    const events = carrierEventsOf(tracked);
    const explanation =
      events === null
        ? null
        : explainTracking({ parcel: null, carrierEvents: events, now: new Date() });
    return { kind: "manual", code, carrierTracking: tracked, explanation };
  }
  return ORDER_NUMBER_PATTERN.test(query.trim())
    ? { kind: "order_not_found" }
    : { kind: "invalid_code" };
}

/** Most parcels the "on their way" list shows. */
const IN_TRANSIT_LIMIT = 10;

export async function parcelsInTransit(tenantId: string) {
  const rows = await listParcelsInTransit(database, tenantId, IN_TRANSIT_LIMIT);
  return rows.map((row) => ({
    shipmentId: row.shipmentId,
    orderId: row.orderId,
    externalOrderId: row.externalOrderId,
    supplierName: row.supplierName,
    catalogKind: row.catalogKind,
    carrier: row.carrier,
    trackingCode: row.trackingCode,
    estimatedDeliveryAt: row.estimatedDeliveryAt,
    delay: row.delay,
  }));
}
