import type {
  SupplierReportReview,
  SupplierReportShipment,
} from "@sellbridge/database/repositories";
import type { ReportPeriod, ReportRange } from "@sellbridge/shared/report-period";
import type {
  SupplierRejectedRow,
  SupplierStockRow,
} from "@sellbridge/shared/supplier-panel-home-queue";

/** Everything the supplier's monthly report is computed from, read once by the server. */
export interface SupplierReportInput {
  period: ReportPeriod;
  now: Date;
  supplier: { acceptWithinHours: number; dispatchWithinHours: number };
  /** Parcels received or dispatched from the first trend month (or the previous window) on. */
  shipments: readonly SupplierReportShipment[];
  /** Reviews of the current and the previous window. */
  reviews: readonly SupplierReportReview[];
  catalog: {
    products: number;
    approved: number;
    outOfStockListed: readonly SupplierStockRow[];
    rejected: readonly SupplierRejectedRow[];
  };
}

const MINUTE_MILLISECONDS = 60_000;

export function isWithin(date: Date | null, range: ReportRange): boolean {
  if (date === null) {
    return false;
  }
  return date.getTime() >= range.from.getTime() && date.getTime() < range.to.getTime();
}

/** Parcels whose current round with the supplier started in the range. */
export function receivedIn(
  shipments: readonly SupplierReportShipment[],
  range: ReportRange,
): SupplierReportShipment[] {
  return shipments.filter((shipment) => isWithin(shipment.receivedAt, range));
}

/** Parcels first marked shipped in the range, whenever they were received. */
export function dispatchedIn(
  shipments: readonly SupplierReportShipment[],
  range: ReportRange,
): SupplierReportShipment[] {
  return shipments.filter((shipment) => isWithin(shipment.shippedAt, range));
}

export function reviewsIn(
  reviews: readonly SupplierReportReview[],
  range: ReportRange,
): SupplierReportReview[] {
  return reviews.filter((review) => isWithin(review.createdAt, range));
}

/** Minutes from the receipt to the dispatch of each dispatched parcel. */
export function dispatchMinutes(shipments: readonly SupplierReportShipment[]): number[] {
  return shipments.flatMap((shipment) => {
    if (shipment.shippedAt === null) {
      return [];
    }
    const elapsed = shipment.shippedAt.getTime() - shipment.receivedAt.getTime();
    return [Math.max(0, elapsed / MINUTE_MILLISECONDS)];
  });
}

/** "2× Caneca, 1× Copo": the parcel's items in one line. */
export function itemsSummary(shipment: SupplierReportShipment): string {
  return shipment.items.map((item) => `${item.quantity}× ${item.title}`).join(", ");
}
