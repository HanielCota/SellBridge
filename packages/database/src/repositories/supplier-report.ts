import { validationError } from "@sellbridge/shared/errors";
import type {
  ReviewHealthRecord,
  ShipmentHealthRecord,
} from "@sellbridge/shared/supplier-panel-health";
import type { RejectionReason } from "@sellbridge/shared/supplier-panel-catalog-status";
import { and, asc, eq, gte, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import {
  listings,
  listingTargets,
  orderItems,
  orders,
  orderShipments,
  supplierProducts,
  supplierReviews,
  suppliers,
} from "../schema/index.ts";
import { firstShippedAt, shipmentTimingColumns } from "./shipment-timing.ts";
import { cancelledBySupplier, firstAcceptedAt, roundStartedAt } from "./supplier-panel-home.ts";
import { timestampOf } from "./sql/raw-values.ts";

/**
 * Reads behind the supplier's monthly report and its two spreadsheets. Scoped by `supplierId`
 * alone, like the panel: the supplier's own price per item (the reseller's cost), never the
 * reseller's sale price, the buyer's name, contact or street. Destination is city and state.
 */

/** Rows one supplier spreadsheet carries: larger periods are refused, never cut short. */
export const MAX_SUPPLIER_EXPORT_ROWS = 20_000;

const reportItemSchema = z.object({
  title: z.string(),
  sku: z.string(),
  quantity: z.number().int(),
  unitCostCents: z.number().int().nullable(),
  productId: z.string().nullable(),
});
export type SupplierReportItem = z.infer<typeof reportItemSchema>;

export interface SupplierReportShipment extends ShipmentHealthRecord {
  /** Start of the parcel's current round with the supplier: the date it was received. */
  receivedAt: Date;
  items: SupplierReportItem[];
  trackingCode: string | null;
  destinationCity: string | null;
  destinationState: string | null;
}

export interface SupplierReportReview extends ReviewHealthRecord {
  comment: string;
}

/**
 * The parcel's items with the supplier's price of each (`unit_cost_cents` of the order line),
 * matched by the order item id the forward kept. A line no longer found keeps a null price.
 */
const itemsWithCost = sql<unknown>`(
  select coalesce(jsonb_agg(jsonb_build_object(
    'title', entry.item->>'title',
    'sku', entry.item->>'sku',
    'quantity', (entry.item->>'quantity')::int,
    'unitCostCents', ${orderItems.unitCostCents},
    'productId', ${orderItems.supplierProductId}
  ) order by entry.position), '[]'::jsonb)
  from jsonb_array_elements(${orderShipments.items}) with ordinality as entry(item, position)
  left join ${orderItems} on ${orderItems.orderId} = ${orderShipments.orderId}
    and ${orderItems.id}::text = entry.item->>'orderItemId'
)`;

const receivedAt = sql<Date>`${roundStartedAt}`.mapWith((value: string | Date) => new Date(value));

const shipmentColumns = {
  shipmentId: orderShipments.id,
  orderId: orders.id,
  externalOrderId: orders.externalOrderId,
  ...shipmentTimingColumns,
  acceptedAt: firstAcceptedAt,
  cancelledBySupplier,
  receivedAt,
  items: itemsWithCost,
  trackingCode: orderShipments.trackingCode,
  destinationCity: sql<string | null>`${orderShipments.address}->>'city'`,
  destinationState: sql<string | null>`${orderShipments.address}->>'state'`,
};

async function selectShipments(database: Database, filter: SQL | undefined, limit: number | null) {
  const query = database
    .select(shipmentColumns)
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(filter)
    .orderBy(sql`${roundStartedAt} asc`, asc(orderShipments.id));
  const rows = limit === null ? await query : await query.limit(limit);
  return rows.map((row) => ({ ...row, items: z.array(reportItemSchema).parse(row.items) }));
}

/**
 * The supplier's parcels received before `until` that were received or dispatched from `since`
 * on: the report counts receipts by the date received and dispatches by the date dispatched.
 */
export async function listSupplierReportShipments(
  database: Database,
  input: { supplierId: string; since: Date; until: Date },
): Promise<SupplierReportShipment[]> {
  const filter = and(
    eq(orderShipments.supplierId, input.supplierId),
    sql`${roundStartedAt} < ${timestampOf(input.until)}`,
    or(
      sql`${roundStartedAt} >= ${timestampOf(input.since)}`,
      sql`${firstShippedAt} >= ${timestampOf(input.since)}`,
    ),
  );
  return selectShipments(database, filter, null);
}

function tooManyRows(maxRows: number) {
  return validationError(
    `O período tem mais de ${maxRows.toLocaleString("pt-BR")} linhas. Baixe um período menor.`,
  );
}

/** Parcels received in `[from, to)`, oldest first, for the orders spreadsheet. */
export async function exportSupplierShipments(
  database: Database,
  input: { supplierId: string; from: Date; to: Date; maxRows?: number },
): Promise<SupplierReportShipment[]> {
  const maxRows = input.maxRows ?? MAX_SUPPLIER_EXPORT_ROWS;
  const filter = and(
    eq(orderShipments.supplierId, input.supplierId),
    sql`${roundStartedAt} >= ${timestampOf(input.from)}`,
    sql`${roundStartedAt} < ${timestampOf(input.to)}`,
  );
  const shipments = await selectShipments(database, filter, maxRows + 1);
  const lines = shipments.reduce(
    (total, shipment) => total + Math.max(1, shipment.items.length),
    0,
  );
  if (lines > maxRows) {
    throw tooManyRows(maxRows);
  }
  return shipments;
}

/** The supplier's reviews left in `[since, until)`, with the reseller's comment. */
export async function listSupplierReportReviews(
  database: Database,
  input: { supplierId: string; since: Date; until: Date },
): Promise<SupplierReportReview[]> {
  return database
    .select({
      orderId: supplierReviews.orderId,
      externalOrderId: orders.externalOrderId,
      rating: supplierReviews.rating,
      tags: supplierReviews.tags,
      comment: supplierReviews.comment,
      createdAt: supplierReviews.createdAt,
    })
    .from(supplierReviews)
    .innerJoin(orders, eq(orders.id, supplierReviews.orderId))
    .where(
      and(
        eq(supplierReviews.supplierId, input.supplierId),
        gte(supplierReviews.createdAt, input.since),
        lt(supplierReviews.createdAt, input.until),
      ),
    )
    .orderBy(asc(supplierReviews.createdAt));
}

/** How many products the supplier has, and how many reach resellers (active and approved). */
export async function summarizeSupplierCatalog(database: Database, supplierId: string) {
  const [row] = await database
    .select({
      products: sql<number>`count(*)::int`,
      approved: sql<number>`(count(*) filter (where ${supplierProducts.active} and ${supplierProducts.reviewStatus} = 'approved'))::int`,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierId, supplierId));
  return { products: row?.products ?? 0, approved: row?.approved ?? 0 };
}

export interface SupplierProductExportRow {
  productId: string;
  sku: string;
  title: string;
  costCents: number;
  stock: number;
  reservedStock: number;
  active: boolean;
  reviewStatus: string;
  rejectionReasons: RejectionReason[];
  /** Reseller accounts with at least one published listing of the product. */
  resellers: number;
  publishedListings: number;
  soldUnits: number;
}

const publishedFilter = sql`${listingTargets.status} = 'published'`;

/** Units of the product in the supplier's parcels received in the period, cancelled ones aside. */
function soldUnitsBetween(from: Date, to: Date) {
  return sql<number>`(
    select coalesce(sum(${orderItems.quantity}), 0)::int from ${orderItems}
    inner join ${orderShipments} on ${orderShipments.orderId} = ${orderItems.orderId}
      and ${orderShipments.supplierId} = ${supplierProducts.supplierId}
    where ${orderItems.supplierProductId} = ${supplierProducts.id}
      and ${orderShipments.status} <> 'cancelled'
      and ${roundStartedAt} >= ${timestampOf(from)}
      and ${roundStartedAt} < ${timestampOf(to)}
  )`.mapWith(Number);
}

/** Every product of the supplier with its listings and the units sold in `[from, to)`. */
export async function exportSupplierProducts(
  database: Database,
  input: { supplierId: string; from: Date; to: Date; maxRows?: number },
): Promise<SupplierProductExportRow[]> {
  const maxRows = input.maxRows ?? MAX_SUPPLIER_EXPORT_ROWS;
  const rows = await database
    .select({
      productId: supplierProducts.id,
      sku: supplierProducts.sku,
      title: supplierProducts.title,
      costCents: supplierProducts.costCents,
      stock: supplierProducts.stock,
      reservedStock: supplierProducts.reservedStock,
      active: supplierProducts.active,
      reviewStatus: supplierProducts.reviewStatus,
      rejectionReasons: supplierProducts.rejectionReasons,
      resellers: sql<number>`(count(distinct ${listings.tenantId}) filter (where ${publishedFilter}))::int`,
      publishedListings: sql<number>`(count(${listingTargets.id}) filter (where ${publishedFilter}))::int`,
      soldUnits: soldUnitsBetween(input.from, input.to),
    })
    .from(supplierProducts)
    .leftJoin(listings, eq(listings.supplierProductId, supplierProducts.id))
    .leftJoin(listingTargets, eq(listingTargets.listingId, listings.id))
    .where(eq(supplierProducts.supplierId, input.supplierId))
    .groupBy(supplierProducts.id)
    .orderBy(asc(supplierProducts.title), asc(supplierProducts.id))
    .limit(maxRows + 1);
  if (rows.length > maxRows) {
    throw tooManyRows(maxRows);
  }
  return rows;
}
