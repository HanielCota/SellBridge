import {
  redactContactDetails,
  toPaginated,
  type Paginated,
  type Pagination,
} from "@sellbridge/shared/schemas";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { sqlIntegerSchema } from "./sql/raw-values.ts";

/**
 * One review as moderation reads it: the comment, with the supplier, the order and the store
 * behind it. Comments are never shown to other resellers nor to the supplier: a reseller may
 * blame the supplier for the marketplace's logistics, so only moderation reads them.
 */
export interface ModeratedSupplierReview {
  id: string;
  supplierId: string;
  supplierName: string;
  rating: number;
  tags: string[];
  comment: string;
  externalOrderId: string;
  storeName: string;
  createdAt: Date;
}

export interface ModerationFilters {
  /** One supplier's reviews (its admin page); every supplier's when left out. */
  supplierId?: string | undefined;
  /** Leaves out reviews without a comment, blank or spaces only. */
  withCommentOnly: boolean;
}

const moderatedReviewRowSchema = z.object({
  id: z.string(),
  supplier_id: z.string(),
  supplier_name: z.string(),
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
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    rating: row.rating,
    tags: row.tags,
    // Reviews saved before comments were cleaned on save may still carry contact details.
    comment: redactContactDetails(row.comment),
    externalOrderId: row.external_order_id,
    storeName: row.shop_name,
    createdAt: row.created_at,
  };
}

function moderationConditions(filters: ModerationFilters): SQL {
  const conditions: SQL[] = [sql`true`];
  if (filters.supplierId !== undefined) {
    conditions.push(sql`r.supplier_id = ${filters.supplierId}::uuid`);
  }
  if (filters.withCommentOnly) {
    // Any non-space character: `btrim` alone keeps a comment of line breaks or tabs, which the
    // screen shows as "Sem comentário."
    conditions.push(sql`r.comment ~ '[^[:space:]]'`);
  }
  return sql.join(conditions, sql` and `);
}

/**
 * Reviews for the SellBridge team only (`reviews.moderate`), newest first: one supplier's or
 * every supplier's, optionally only the ones with a comment.
 */
export async function listReviewsForModeration(
  database: Database,
  filters: ModerationFilters,
  pagination: Pagination,
): Promise<Paginated<ModeratedSupplierReview>> {
  const where = moderationConditions(filters);
  const [rows, totals] = await Promise.all([
    database.execute(sql`
      select r.id, r.supplier_id, s.name as supplier_name, r.rating, r.tags, r.comment,
        o.external_order_id, sc.shop_name, r.created_at
      from supplier_reviews r
      join suppliers s on s.id = r.supplier_id
      join orders o on o.id = r.order_id
      join store_connections sc on sc.id = o.store_connection_id
      where ${where}
      order by r.created_at desc, r.id
      limit ${pagination.pageSize} offset ${(pagination.page - 1) * pagination.pageSize}
    `),
    database.execute(sql`select count(*) as total from supplier_reviews r where ${where}`),
  ]);
  const total = z.object({ total: sqlIntegerSchema }).parse(totals[0]).total;
  const items = z
    .array(moderatedReviewRowSchema)
    .parse([...rows])
    .map(toModeratedReview);
  return toPaginated(items, total, pagination);
}
