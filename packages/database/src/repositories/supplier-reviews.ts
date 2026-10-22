import {
  redactContactDetails,
  REVIEW_ASPECTS,
  reviewTagSchema,
  toPaginated,
  type Paginated,
  type Pagination,
  type ReviewFilter,
} from "@sellbridge/shared/schemas";
import {
  emptyReputationStats,
  type SupplierReputationStats,
} from "@sellbridge/shared/supplier-score";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { supplierReviews } from "../schema/index.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";
import { containsPattern } from "./sql/search-pattern.ts";

/** Statuses that close an order: only these count for the cancellation and return rates. */
const FINISHED_STATUSES = sql.raw("('delivered', 'shipped', 'cancelled', 'returned')");

/**
 * Cancelled before anyone paid (an unpaid boleto): the items never left "pending". That is the
 * buyer's doing, so it counts neither as a cancellation nor as a finished order of the supplier.
 */
const UNPAID_CANCELLATION = sql.raw("(o.status = 'cancelled' and oi.stock_state = 'pending')");

function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

const reviewTotalsSchema = z.object({
  supplier_id: z.string(),
  reviews: sqlIntegerSchema,
  rating_sum: sqlIntegerSchema,
  positive: sqlIntegerSchema,
  neutral: sqlIntegerSchema,
  negative: sqlIntegerSchema,
});

const tagTotalsSchema = z.object({
  supplier_id: z.string(),
  tag: z.string(),
  total: sqlIntegerSchema,
});

const orderTotalsSchema = z.object({
  supplier_id: z.string(),
  finished: sqlIntegerSchema,
  cancelled: sqlIntegerSchema,
  returned: sqlIntegerSchema,
});

async function reviewTotals(database: Database, ids: readonly string[], from: Date) {
  const rows = await database.execute(sql`
    select r.supplier_id, count(*) as reviews, coalesce(sum(r.rating), 0) as rating_sum,
      count(*) filter (where r.rating >= 4) as positive,
      count(*) filter (where r.rating = 3) as neutral,
      count(*) filter (where r.rating <= 2) as negative
    from supplier_reviews r
    where r.supplier_id in (${uuidList(ids)}) and r.created_at >= ${timestampOf(from)}
    group by r.supplier_id
  `);
  return z.array(reviewTotalsSchema).parse([...rows]);
}

async function tagTotals(database: Database, ids: readonly string[], from: Date) {
  const rows = await database.execute(sql`
    select r.supplier_id, tag, count(*) as total
    from supplier_reviews r cross join lateral unnest(r.tags) as tag
    where r.supplier_id in (${uuidList(ids)}) and r.created_at >= ${timestampOf(from)}
    group by r.supplier_id, tag
  `);
  return z.array(tagTotalsSchema).parse([...rows]);
}

/**
 * The order was a sale at some point: a buyer who never paid (a cart left at "payment required",
 * cancelled by the marketplace) says nothing about the supplier. Orders stored before status
 * changes were recorded have no history to tell, and keep counting as before.
 */
const reachedSale = sql`(
  exists (
    select 1 from order_status_changes c
    where c.order_id = o.id and c.status in ('paid', 'shipped', 'delivered')
  )
  or not exists (select 1 from order_status_changes c where c.order_id = o.id)
)`;

async function orderTotals(database: Database, ids: readonly string[], from: Date) {
  const rows = await database.execute(sql`
    select sp.supplier_id,
      count(distinct o.id) filter (
        where o.status in ${FINISHED_STATUSES} and not ${UNPAID_CANCELLATION}
      ) as finished,
      count(distinct o.id) filter (
        where o.status = 'cancelled' and not ${UNPAID_CANCELLATION}
      ) as cancelled,
      count(distinct o.id) filter (where o.status = 'returned') as returned
    from orders o
    join order_items oi on oi.order_id = o.id
    join supplier_products sp on sp.id = oi.supplier_product_id
    where sp.supplier_id in (${uuidList(ids)}) and o.ordered_at >= ${timestampOf(from)}
      and ${reachedSale}
    group by sp.supplier_id
  `);
  return z.array(orderTotalsSchema).parse([...rows]);
}

type ReviewTotals = z.infer<typeof reviewTotalsSchema>;
type TagTotals = z.infer<typeof tagTotalsSchema>;
type OrderTotals = z.infer<typeof orderTotalsSchema>;
type AspectTotals = SupplierReputationStats["aspects"];

const aspectSchema = z.enum(REVIEW_ASPECTS);

function addTag(aspects: AspectTotals, row: TagTotals): AspectTotals {
  const tag = reviewTagSchema.safeParse(row.tag);
  if (!tag.success) {
    return aspects;
  }
  const [aspectName, verdict] = tag.data.split(":");
  const aspect = aspectSchema.safeParse(aspectName);
  if (!aspect.success) {
    return aspects;
  }
  const counts = aspects[aspect.data];
  if (verdict === "good") {
    return { ...aspects, [aspect.data]: { ...counts, good: counts.good + row.total } };
  }
  return { ...aspects, [aspect.data]: { ...counts, bad: counts.bad + row.total } };
}

function reviewFields(review: ReviewTotals | undefined): Partial<SupplierReputationStats> {
  if (!review) {
    return {};
  }
  return {
    reviewCount: review.reviews,
    ratingSum: review.rating_sum,
    positiveCount: review.positive,
    neutralCount: review.neutral,
    negativeCount: review.negative,
  };
}

function orderFields(order: OrderTotals | undefined): Partial<SupplierReputationStats> {
  if (!order) {
    return {};
  }
  return {
    orderCount: order.finished,
    cancelledCount: order.cancelled,
    returnedCount: order.returned,
  };
}

function toStats(
  review: ReviewTotals | undefined,
  tags: readonly TagTotals[],
  order: OrderTotals | undefined,
): SupplierReputationStats {
  const empty = emptyReputationStats();
  return {
    ...empty,
    ...reviewFields(review),
    ...orderFields(order),
    aspects: tags.reduce(addTag, empty.aspects),
  };
}

/**
 * Review and order numbers of each supplier since `from`, across every tenant: the score is
 * shared, like a marketplace reputation. Suppliers without activity get empty stats.
 */
export async function getSupplierReputationStats(
  database: Database,
  supplierIds: readonly string[],
  from: Date,
): Promise<Map<string, SupplierReputationStats>> {
  if (supplierIds.length === 0) {
    return new Map();
  }
  const [reviews, tags, ordersBySupplier] = await Promise.all([
    reviewTotals(database, supplierIds, from),
    tagTotals(database, supplierIds, from),
    orderTotals(database, supplierIds, from),
  ]);
  return new Map(
    supplierIds.map((id) => [
      id,
      toStats(
        reviews.find((row) => row.supplier_id === id),
        tags.filter((row) => row.supplier_id === id),
        ordersBySupplier.find((row) => row.supplier_id === id),
      ),
    ]),
  );
}

/** One review as moderation reads it: the comment, with the order and the store behind it. */
export interface ModeratedSupplierReview {
  id: string;
  rating: number;
  tags: string[];
  comment: string;
  externalOrderId: string;
  storeName: string;
  createdAt: Date;
}

const moderatedReviewRowSchema = z.object({
  id: z.string(),
  rating: sqlIntegerSchema,
  tags: z.array(z.string()),
  comment: z.string(),
  external_order_id: z.string(),
  shop_name: z.string(),
  created_at: z.coerce.date(),
});

function toModeratedReview(row: z.infer<typeof moderatedReviewRowSchema>): ModeratedSupplierReview {
  return {
    id: row.id,
    rating: row.rating,
    tags: row.tags,
    // Reviews saved before comments were cleaned on save may still carry contact details.
    comment: redactContactDetails(row.comment),
    externalOrderId: row.external_order_id,
    storeName: row.shop_name,
    createdAt: row.created_at,
  };
}

/**
 * Every review of a supplier, newest first, for the SellBridge team only (`reviews.moderate`).
 * Comments are never shown to other resellers nor to the supplier: a reseller may blame the
 * supplier for the marketplace's logistics, so only moderation reads them.
 */
export async function listSupplierReviewsForModeration(
  database: Database,
  supplierId: string,
  pagination: Pagination,
): Promise<Paginated<ModeratedSupplierReview>> {
  const [rows, totals] = await Promise.all([
    database.execute(sql`
      select r.id, r.rating, r.tags, r.comment, o.external_order_id, sc.shop_name, r.created_at
      from supplier_reviews r
      join orders o on o.id = r.order_id
      join store_connections sc on sc.id = o.store_connection_id
      where r.supplier_id = ${supplierId}::uuid
      order by r.created_at desc, r.id
      limit ${pagination.pageSize} offset ${(pagination.page - 1) * pagination.pageSize}
    `),
    database.execute(sql`
      select count(*) as total from supplier_reviews where supplier_id = ${supplierId}::uuid
    `),
  ]);
  const total = z.object({ total: sqlIntegerSchema }).parse(totals[0]).total;
  const items = z
    .array(moderatedReviewRowSchema)
    .parse([...rows])
    .map(toModeratedReview);
  return toPaginated(items, total, pagination);
}

export interface OrderReview {
  rating: number;
  tags: string[];
  comment: string;
  updatedAt: Date;
}

/** One order of the tenant seen from one of its suppliers. */
export interface ReviewableOrderRow {
  orderId: string;
  externalOrderId: string;
  orderedAt: Date;
  deliveredAt: Date | null;
  status: string;
  storeName: string;
  supplierId: string;
  supplierName: string;
  supplierLogoUrl: string | null;
  items: string;
  units: number;
  review: OrderReview | null;
}

const reviewableRowSchema = z.object({
  order_id: z.string(),
  external_order_id: z.string(),
  ordered_at: z.coerce.date(),
  delivered_at: z.coerce.date().nullable(),
  status: z.string(),
  shop_name: z.string(),
  supplier_id: z.string(),
  supplier_name: z.string(),
  logo_url: z.string().nullable(),
  item_titles: z.string(),
  units: sqlIntegerSchema,
  rating: sqlIntegerSchema.nullable(),
  tags: z.array(z.string()).nullable(),
  comment: z.string().nullable(),
  review_updated_at: z.coerce.date().nullable(),
});

function toReviewableRow(row: z.infer<typeof reviewableRowSchema>): ReviewableOrderRow {
  const review =
    row.rating === null || row.review_updated_at === null
      ? null
      : {
          rating: row.rating,
          tags: row.tags ?? [],
          comment: row.comment ?? "",
          updatedAt: row.review_updated_at,
        };
  return {
    orderId: row.order_id,
    externalOrderId: row.external_order_id,
    orderedAt: row.ordered_at,
    deliveredAt: row.delivered_at,
    status: row.status,
    storeName: row.shop_name,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierLogoUrl: row.logo_url,
    items: row.item_titles,
    units: row.units,
    review,
  };
}

export interface ReviewableOrderFilters {
  filter: ReviewFilter;
  search?: string | undefined;
  /** Orders delivered before this can no longer be reviewed. */
  reviewableSince: Date;
}

function reviewConditions(filters: ReviewableOrderFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.filter === "pending") {
    conditions.push(
      sql`o.status = 'delivered' and ${DELIVERED_AT} >= ${timestampOf(filters.reviewableSince)} and r.id is null`,
    );
  }
  if (filters.filter === "done") {
    conditions.push(sql`r.id is not null`);
  }
  if (filters.search) {
    const term = containsPattern(filters.search);
    conditions.push(sql`(o.external_order_id ilike ${term} or s.name ilike ${term})`);
  }
  return conditions;
}

/** Orders synced before delivery dates existed fall back to their order date. */
const DELIVERED_AT = sql.raw("coalesce(o.delivered_at, o.ordered_at)");

/** One row per order and supplier of the tenant, with the review when there is one. */
function reviewablePairsCte(tenantId: string, filters: ReviewableOrderFilters): SQL {
  const conditions = [
    sql`o.tenant_id = ${tenantId}`,
    sql`s.catalog_kind = 'supplier'`,
    ...reviewConditions(filters),
  ];
  return sql`pairs as (
    select o.id as order_id, o.external_order_id, o.ordered_at, ${DELIVERED_AT} as delivered_at,
      o.status, sc.shop_name,
      s.id as supplier_id, s.name as supplier_name, s.logo_url,
      string_agg(oi.title, ', ' order by oi.title) as item_titles,
      sum(oi.quantity) as units,
      r.rating, r.tags, r.comment, r.updated_at as review_updated_at
    from orders o
    join store_connections sc on sc.id = o.store_connection_id
    join order_items oi on oi.order_id = o.id
    join supplier_products sp on sp.id = oi.supplier_product_id
    join suppliers s on s.id = sp.supplier_id
    left join supplier_reviews r on r.order_id = o.id and r.supplier_id = s.id
    where ${sql.join(conditions, sql` and `)}
    group by o.id, sc.shop_name, s.id, r.id
  )`;
}

export async function listReviewableOrders(
  database: Database,
  tenantId: string,
  query: { readonly filters: ReviewableOrderFilters; readonly pagination: Pagination },
): Promise<Paginated<ReviewableOrderRow>> {
  const { filters, pagination } = query;
  const cte = reviewablePairsCte(tenantId, filters);
  const [rows, totals] = await Promise.all([
    database.execute(sql`
      with ${cte}
      select * from pairs
      order by ordered_at desc, order_id, supplier_id
      limit ${pagination.pageSize} offset ${(pagination.page - 1) * pagination.pageSize}
    `),
    database.execute(sql`with ${cte} select count(*) as total from pairs`),
  ]);
  const total = z.object({ total: sqlIntegerSchema }).parse(totals[0]).total;
  const items = z
    .array(reviewableRowSchema)
    .parse([...rows])
    .map(toReviewableRow);
  return toPaginated(items, total, pagination);
}

/** Delivered (order, supplier) pairs still waiting for a review, and the latest delivery. */
export async function countPendingReviews(
  database: Database,
  tenantId: string,
  reviewableSince: Date,
): Promise<{ total: number; latestDeliveredAt: Date | null }> {
  const cte = reviewablePairsCte(tenantId, { filter: "pending", reviewableSince });
  const rows = await database.execute(sql`
    with ${cte} select count(*) as total, max(delivered_at) as latest from pairs
  `);
  const row = z
    .object({ total: sqlIntegerSchema, latest: z.coerce.date().nullable() })
    .parse(rows[0]);
  return { total: row.total, latestDeliveredAt: row.latest };
}

/**
 * The order as the reviewer sees it, only when it belongs to the tenant and has items of the
 * supplier; null otherwise.
 */
export async function getReviewTarget(
  database: Database,
  tenantId: string,
  target: { orderId: string; supplierId: string },
): Promise<{ status: string; orderedAt: Date; deliveredAt: Date | null } | null> {
  const rows = await database.execute(sql`
    select o.status, o.ordered_at, o.delivered_at
    from orders o
    where o.id = ${target.orderId}::uuid and o.tenant_id = ${tenantId}
      and exists (
        select 1 from order_items oi
        join supplier_products sp on sp.id = oi.supplier_product_id
        join suppliers s on s.id = sp.supplier_id and s.catalog_kind = 'supplier'
        where oi.order_id = o.id and sp.supplier_id = ${target.supplierId}::uuid
      )
  `);
  const row = rows.at(0);
  if (!row) {
    return null;
  }
  const parsed = z
    .object({
      status: z.string(),
      ordered_at: z.coerce.date(),
      delivered_at: z.coerce.date().nullable(),
    })
    .parse(row);
  return { status: parsed.status, orderedAt: parsed.ordered_at, deliveredAt: parsed.delivered_at };
}

export interface SaveSupplierReviewInput {
  orderId: string;
  supplierId: string;
  rating: number;
  tags: readonly string[];
  comment: string;
}

/** Creates the review of the order and supplier, or replaces the tenant's previous one. */
export async function saveSupplierReview(
  database: Database,
  tenantId: string,
  input: SaveSupplierReviewInput,
): Promise<void> {
  if ((await getReviewTarget(database, tenantId, input)) === null) return;
  const values = { rating: input.rating, tags: [...input.tags], comment: input.comment };
  await database
    .insert(supplierReviews)
    .values({ tenantId, orderId: input.orderId, supplierId: input.supplierId, ...values })
    .onConflictDoUpdate({
      target: [supplierReviews.orderId, supplierReviews.supplierId],
      set: { ...values, updatedAt: new Date() },
      setWhere: sql`${supplierReviews.tenantId} = ${tenantId}`,
    });
}
