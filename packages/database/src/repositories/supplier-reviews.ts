import {
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
import { containsPattern } from "./sql/search-pattern.ts";

const countSchema = z.coerce.number().int();

/** Statuses that close an order: only these count for the cancellation and return rates. */
const FINISHED_STATUSES = sql.raw("('delivered', 'shipped', 'cancelled', 'returned')");

function uuidList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

function since(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}

const reviewTotalsSchema = z.object({
  supplier_id: z.string(),
  reviews: countSchema,
  rating_sum: countSchema,
  positive: countSchema,
  neutral: countSchema,
  negative: countSchema,
});

const tagTotalsSchema = z.object({ supplier_id: z.string(), tag: z.string(), total: countSchema });

const orderTotalsSchema = z.object({
  supplier_id: z.string(),
  finished: countSchema,
  cancelled: countSchema,
  returned: countSchema,
});

async function reviewTotals(database: Database, ids: readonly string[], from: Date) {
  const rows = await database.execute(sql`
    select r.supplier_id, count(*) as reviews, coalesce(sum(r.rating), 0) as rating_sum,
      count(*) filter (where r.rating >= 4) as positive,
      count(*) filter (where r.rating = 3) as neutral,
      count(*) filter (where r.rating <= 2) as negative
    from supplier_reviews r
    where r.supplier_id in (${uuidList(ids)}) and r.created_at >= ${since(from)}
    group by r.supplier_id
  `);
  return z.array(reviewTotalsSchema).parse([...rows]);
}

async function tagTotals(database: Database, ids: readonly string[], from: Date) {
  const rows = await database.execute(sql`
    select r.supplier_id, tag, count(*) as total
    from supplier_reviews r cross join lateral unnest(r.tags) as tag
    where r.supplier_id in (${uuidList(ids)}) and r.created_at >= ${since(from)}
    group by r.supplier_id, tag
  `);
  return z.array(tagTotalsSchema).parse([...rows]);
}

async function orderTotals(database: Database, ids: readonly string[], from: Date) {
  const rows = await database.execute(sql`
    select sp.supplier_id,
      count(distinct o.id) filter (where o.status in ${FINISHED_STATUSES}) as finished,
      count(distinct o.id) filter (where o.status = 'cancelled') as cancelled,
      count(distinct o.id) filter (where o.status = 'returned') as returned
    from orders o
    join order_items oi on oi.order_id = o.id
    join supplier_products sp on sp.id = oi.supplier_product_id
    where sp.supplier_id in (${uuidList(ids)}) and o.ordered_at >= ${since(from)}
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

export interface PublicSupplierReview {
  id: string;
  rating: number;
  tags: string[];
  comment: string;
  createdAt: Date;
}

/** Latest written reviews of a supplier; the reviewing tenant is never exposed. */
export async function listRecentSupplierReviews(
  database: Database,
  supplierId: string,
  limit = 5,
): Promise<PublicSupplierReview[]> {
  const rows = await database.execute(sql`
    select id, rating, tags, comment, created_at
    from supplier_reviews
    where supplier_id = ${supplierId}::uuid and comment <> ''
    order by created_at desc
    limit ${limit}
  `);
  return z
    .array(
      z.object({
        id: z.string(),
        rating: countSchema,
        tags: z.array(z.string()),
        comment: z.string(),
        created_at: z.coerce.date(),
      }),
    )
    .parse([...rows])
    .map((row) => ({
      id: row.id,
      rating: row.rating,
      tags: row.tags,
      comment: row.comment,
      createdAt: row.created_at,
    }));
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
  status: z.string(),
  shop_name: z.string(),
  supplier_id: z.string(),
  supplier_name: z.string(),
  logo_url: z.string().nullable(),
  item_titles: z.string(),
  units: countSchema,
  rating: countSchema.nullable(),
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
  /** Delivered orders placed before this can no longer be reviewed. */
  reviewableSince: Date;
}

function reviewConditions(filters: ReviewableOrderFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.filter === "pending") {
    conditions.push(
      sql`o.status = 'delivered' and o.ordered_at >= ${since(filters.reviewableSince)} and r.id is null`,
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

/** One row per order and supplier of the tenant, with the review when there is one. */
function reviewablePairsCte(tenantId: string, filters: ReviewableOrderFilters): SQL {
  const conditions = [sql`o.tenant_id = ${tenantId}`, ...reviewConditions(filters)];
  return sql`pairs as (
    select o.id as order_id, o.external_order_id, o.ordered_at, o.status, sc.shop_name,
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
  const total = z.object({ total: countSchema }).parse(totals[0]).total;
  const items = z
    .array(reviewableRowSchema)
    .parse([...rows])
    .map(toReviewableRow);
  return toPaginated(items, total, pagination);
}

/** Delivered (order, supplier) pairs still waiting for a review, and the newest sale among them. */
export async function countPendingReviews(
  database: Database,
  tenantId: string,
  reviewableSince: Date,
): Promise<{ total: number; latestOrderedAt: Date | null }> {
  const cte = reviewablePairsCte(tenantId, { filter: "pending", reviewableSince });
  const rows = await database.execute(sql`
    with ${cte} select count(*) as total, max(ordered_at) as latest from pairs
  `);
  const row = z.object({ total: countSchema, latest: z.coerce.date().nullable() }).parse(rows[0]);
  return { total: row.total, latestOrderedAt: row.latest };
}

/**
 * The order as the reviewer sees it, only when it belongs to the tenant and has items of the
 * supplier; null otherwise.
 */
export async function getReviewTarget(
  database: Database,
  tenantId: string,
  target: { orderId: string; supplierId: string },
): Promise<{ status: string; orderedAt: Date } | null> {
  const rows = await database.execute(sql`
    select o.status, o.ordered_at
    from orders o
    where o.id = ${target.orderId}::uuid and o.tenant_id = ${tenantId}
      and exists (
        select 1 from order_items oi
        join supplier_products sp on sp.id = oi.supplier_product_id
        where oi.order_id = o.id and sp.supplier_id = ${target.supplierId}::uuid
      )
  `);
  const row = rows.at(0);
  if (!row) {
    return null;
  }
  const parsed = z.object({ status: z.string(), ordered_at: z.coerce.date() }).parse(row);
  return { status: parsed.status, orderedAt: parsed.ordered_at };
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
