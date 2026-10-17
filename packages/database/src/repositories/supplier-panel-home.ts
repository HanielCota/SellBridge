import { notFoundError } from "@sellbridge/shared/errors";
import {
  SYSTEM_NOTE_ACTOR,
  type OpenShipmentSignal,
  type RejectedProductSignal,
  type StockSignal,
} from "@sellbridge/shared/supplier-panel-attention";
import {
  HEALTH_WINDOW_DAYS,
  healthDrillDown,
  type HealthDrillDownRow,
  type HealthInput,
  type HealthMetricKey,
  type ReviewHealthRecord,
  type ShipmentHealthRecord,
} from "@sellbridge/shared/supplier-panel-health";
import { SHIPMENT_ACTORS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import { DAY_MILLISECONDS } from "@sellbridge/shared/time";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import {
  listings,
  listingTargets,
  orders,
  orderShipments,
  supplierProducts,
  supplierReviews,
  suppliers,
} from "../schema/index.ts";
import { latestForwardedAt, shipmentTimingColumns } from "./shipment-timing.ts";
import { timestampOf } from "./sql/raw-values.ts";

/**
 * Reads behind the supplier panel's home ("Início") and performance ("Desempenho") pages. Every
 * read is scoped by `supplierId` alone: a supplier sees its own parcels across every reseller,
 * like a marketplace reputation, but never a buyer's name or address. The counting lives in
 * `shared/domain/supplier-panel-health.ts` and `supplier-panel-attention.ts`.
 */

/** Two health windows: the current one and the one it is compared with. */
const HEALTH_LOOKBACK_DAYS = HEALTH_WINDOW_DAYS * 2;

const AT_SUPPLIER: FulfillmentStatus[] = ["forwarded", "accepted", "picking", "ready"];

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

/** Start of the parcel's current round with the supplier: its latest real forward. */
const roundStartedAt = sql`coalesce(${latestForwardedAt}, ${orderShipments.createdAt})`;

/** First step past the accept in the current round: a supplier may jump straight ahead. */
const firstAcceptedAt = sql<Date | null>`(
  select min(accepted.created_at) from shipment_events accepted
  where accepted.shipment_id = ${orderShipments.id}
    and accepted.status in ('accepted', 'picking', 'ready', 'shipped')
    and accepted.created_at >= ${roundStartedAt}
)`.mapWith(toDate);

/**
 * The supplier cancelled the parcel through its link ("Não consigo enviar"), in any round: a
 * re-forward after it does not erase the cancellation.
 */
const cancelledBySupplier = sql<boolean>`exists (
  select 1 from shipment_events cancelled
  where cancelled.shipment_id = ${orderShipments.id}
    and cancelled.status = 'cancelled'
    and cancelled.actor = ${SHIPMENT_ACTORS.supplier}
)`.mapWith(Boolean);

const systemNotesSchema = z.array(z.string());

/** Notes SellBridge wrote on the parcel in the current round, oldest first. */
const systemNotes = sql<string[]>`coalesce((
  select array_agg(note.note order by note.created_at) from shipment_events note
  where note.shipment_id = ${orderShipments.id}
    and note.actor = ${SYSTEM_NOTE_ACTOR}
    and note.note <> ''
    and note.created_at >= ${roundStartedAt}
), '{}')`.mapWith((value: unknown) => systemNotesSchema.parse(value));

/** Name and own deadlines of the supplier; a missing id is a typed not found. */
export async function getSupplierPanelProfile(database: Database, supplierId: string) {
  const [supplier] = await database
    .select({
      id: suppliers.id,
      name: suppliers.name,
      acceptWithinHours: suppliers.acceptWithinHours,
      dispatchWithinHours: suppliers.dispatchWithinHours,
    })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  if (supplier === undefined) {
    throw notFoundError(`Fornecedor não encontrado (id recebido: ${supplierId})`);
  }
  return supplier;
}

/** The supplier's parcels whose latest forward is at or after `since`. */
export async function listSupplierShipmentHealthRecords(
  database: Database,
  input: { supplierId: string; since: Date },
): Promise<ShipmentHealthRecord[]> {
  return database
    .select({
      shipmentId: orderShipments.id,
      orderId: orders.id,
      externalOrderId: orders.externalOrderId,
      ...shipmentTimingColumns,
      acceptedAt: firstAcceptedAt,
      cancelledBySupplier,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.supplierId, input.supplierId),
        sql`${roundStartedAt} >= ${timestampOf(input.since)}`,
      ),
    );
}

/** The supplier's reviews left at or after `since`. */
export async function listSupplierReviewHealthRecords(
  database: Database,
  input: { supplierId: string; since: Date },
): Promise<ReviewHealthRecord[]> {
  return database
    .select({
      orderId: supplierReviews.orderId,
      externalOrderId: orders.externalOrderId,
      rating: supplierReviews.rating,
      createdAt: supplierReviews.createdAt,
    })
    .from(supplierReviews)
    .innerJoin(orders, eq(orders.id, supplierReviews.orderId))
    .where(
      and(
        eq(supplierReviews.supplierId, input.supplierId),
        gte(supplierReviews.createdAt, input.since),
      ),
    );
}

/** Both health windows of the supplier, ready for `computeSupplierHealth`. */
export async function loadSupplierHealthInput(
  database: Database,
  input: { supplierId: string; now: Date },
): Promise<HealthInput> {
  const since = new Date(input.now.getTime() - HEALTH_LOOKBACK_DAYS * DAY_MILLISECONDS);
  const scope = { supplierId: input.supplierId, since };
  const [shipments, reviews] = await Promise.all([
    listSupplierShipmentHealthRecords(database, scope),
    listSupplierReviewHealthRecords(database, scope),
  ]);
  return { shipments, reviews, now: input.now };
}

/** The orders of the current window that count against one metric, newest first. */
export async function listSupplierHealthDrillDown(
  database: Database,
  input: { supplierId: string; metric: HealthMetricKey; now: Date },
): Promise<HealthDrillDownRow[]> {
  const healthInput = await loadSupplierHealthInput(database, input);
  return healthDrillDown(input.metric, healthInput);
}

/** Parcels still with the supplier, of orders still alive, oldest forward first. */
export async function listSupplierOpenShipments(
  database: Database,
  supplierId: string,
): Promise<OpenShipmentSignal[]> {
  return database
    .select({
      shipmentId: orderShipments.id,
      orderId: orders.id,
      externalOrderId: orders.externalOrderId,
      ...shipmentTimingColumns,
      systemNotes,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .where(
      and(
        eq(orderShipments.supplierId, supplierId),
        inArray(orderShipments.status, AT_SUPPLIER),
        inArray(orders.status, ["paid", "shipped"]),
      ),
    )
    .orderBy(orderShipments.createdAt);
}

const publishedListings = sql<number>`count(${listingTargets.id}) filter (
  where ${listingTargets.status} = 'published'
)`.mapWith(Number);

/**
 * Active products with nothing left to sell (shelf minus held units) that published listings
 * still show, most listings first. Raw stock, not the clamped one, so an oversold product
 * (held above the shelf) shows as negative.
 */
export async function listSupplierOutOfStockListed(
  database: Database,
  supplierId: string,
): Promise<StockSignal[]> {
  return database
    .select({
      productId: supplierProducts.id,
      title: supplierProducts.title,
      sku: supplierProducts.sku,
      availableStock:
        sql<number>`${supplierProducts.stock} - ${supplierProducts.reservedStock}`.mapWith(Number),
      activeListings: publishedListings,
    })
    .from(supplierProducts)
    .innerJoin(listings, eq(listings.supplierProductId, supplierProducts.id))
    .innerJoin(listingTargets, eq(listingTargets.listingId, listings.id))
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.active, true),
        sql`${supplierProducts.stock} - ${supplierProducts.reservedStock} <= 0`,
      ),
    )
    .groupBy(supplierProducts.id)
    .having(sql`${publishedListings} > 0`)
    .orderBy(desc(publishedListings));
}

/** The supplier's products the review refused, the most recently refused first. */
export async function listSupplierRejectedProducts(
  database: Database,
  supplierId: string,
): Promise<RejectedProductSignal[]> {
  return database
    .select({
      productId: supplierProducts.id,
      title: supplierProducts.title,
      sku: supplierProducts.sku,
    })
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.reviewStatus, "rejected"),
      ),
    )
    .orderBy(desc(supplierProducts.reviewedAt), supplierProducts.id);
}
