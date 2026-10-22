import {
  listParcelsInTransit,
  listTrackedParcels,
  type TrackedParcelFilter,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { carrierTrackingProviderName } from "@/lib/server/environment-schema";
import {
  isCorreiosCode,
  normalizeTrackingInput,
  type CarrierTrackingResult,
} from "./carrier-tracking";
import { createCarrierTrackingProvider } from "./carrier-tracking-provider";
import { explainTracking } from "./tracking-explanation";
import type { TrackedParcelView, TrackingSearchResult } from "./tracking-views";

const carrierTracking = createCarrierTrackingProvider(carrierTrackingProviderName(environment));

type TrackedParcelRow = Awaited<ReturnType<typeof listTrackedParcels>>[number];

/** A failing carrier never breaks the screen: the parcel shows without its events. */
async function trackCode(code: string, handedOverAt: Date | null): Promise<CarrierTrackingResult> {
  try {
    return await carrierTracking.trackParcel({ code, handedOverAt });
  } catch (error) {
    logger.warn("tracking.carrier_unavailable", { provider: carrierTracking.name, error });
    return { state: "unavailable" };
  }
}

function eventsOf(result: CarrierTrackingResult | null) {
  return result?.state === "found" ? result.events : null;
}

async function parcelView(row: TrackedParcelRow): Promise<TrackedParcelView> {
  const code = row.trackingCode === null ? null : normalizeTrackingInput(row.trackingCode);
  const tracked =
    code !== null && isCorreiosCode(code) ? await trackCode(code, row.shippedAt) : null;
  const explanation = explainTracking({
    parcel: row,
    carrierEvents: eventsOf(tracked),
    now: new Date(),
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
  };
}

async function trackedParcelViews(tenantId: string, filter: TrackedParcelFilter) {
  const rows = await listTrackedParcels(database, tenantId, filter);
  return Promise.all(rows.map(parcelView));
}

export async function orderTracking(
  tenantId: string,
  orderId: string,
): Promise<TrackingSearchResult> {
  const parcels = await trackedParcelViews(tenantId, { kind: "order", orderId });
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
  const parcels = await trackedParcelViews(tenantId, {
    kind: "search",
    trackingCode: code,
    externalOrderId,
  });
  if (parcels.length > 0) {
    return { kind: "parcels", parcels };
  }
  if (isCorreiosCode(code)) {
    const tracked = await trackCode(code, null);
    const events = eventsOf(tracked);
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
