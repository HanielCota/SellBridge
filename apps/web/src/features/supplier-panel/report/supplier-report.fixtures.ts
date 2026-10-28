import type {
  SupplierProductExportRow,
  SupplierReportReview,
  SupplierReportShipment,
} from "@sellbridge/database/repositories";
import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import type { SupplierReportInput } from "./supplier-report-input";

export const HOUR = 3_600_000;
/** 2026-10-20 12:00 in Brazil: October is partial, September is closed. */
export const NOW = new Date("2026-10-20T15:00:00.000Z");

/** A parcel received at `receivedAt`, accepted in an hour, shipped `shippedAfterHours` later. */
export function shipmentAt(
  receivedAt: string,
  overrides: Partial<SupplierReportShipment> & { shippedAfterHours?: number | null } = {},
): SupplierReportShipment {
  const received = new Date(receivedAt);
  const { shippedAfterHours = 10, ...rest } = overrides;
  const shippedAt =
    shippedAfterHours === null ? null : new Date(received.getTime() + shippedAfterHours * HOUR);
  return {
    shipmentId: `ship-${receivedAt}`,
    orderId: `order-${receivedAt}`,
    externalOrderId: `MLB-${received.getTime()}`,
    status: shippedAt === null ? "accepted" : "shipped",
    dispatchDeadlineAt: null,
    estimatedDeliveryAt: null,
    shippedAt,
    forwardedAt: received,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    acceptedAt: new Date(received.getTime() + HOUR),
    cancelledBySupplier: false,
    receivedAt: received,
    items: [{ title: "Caneca", sku: "CAN-1", quantity: 2, unitCostCents: 1500, productId: "p1" }],
    trackingCode: "BR123",
    destinationCity: "Recife",
    destinationState: "PE",
    ...rest,
  };
}

export function reviewAt(createdAt: string, rating: number, comment = ""): SupplierReportReview {
  return {
    orderId: `review-${createdAt}`,
    externalOrderId: `MLB-R-${createdAt}`,
    rating,
    tags: [],
    comment,
    createdAt: new Date(createdAt),
  };
}

export function reportInput(overrides: Partial<SupplierReportInput> = {}): SupplierReportInput {
  return {
    period: resolveReportPeriod({ mes: "2026-09" }, NOW),
    now: NOW,
    supplier: { acceptWithinHours: 24, dispatchWithinHours: 48 },
    shipments: [],
    reviews: [],
    catalog: { products: 0, approved: 0, outOfStockListed: [], rejected: [] },
    ...overrides,
  };
}

export function productRow(
  overrides: Partial<SupplierProductExportRow> = {},
): SupplierProductExportRow {
  return {
    productId: "p1",
    sku: "CAN-1",
    title: "Caneca",
    costCents: 1500,
    stock: 10,
    reservedStock: 0,
    active: true,
    reviewStatus: "approved",
    rejectionReasons: [],
    resellers: 2,
    publishedListings: 3,
    soldUnits: 4,
    ...overrides,
  };
}
