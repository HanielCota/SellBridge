import { z } from "zod";

/**
 * Deepest page a list serves. Beyond it the offset only scans rows to return nothing, and at
 * Number.MAX_SAFE_INTEGER it no longer converts exactly to the database's bigint.
 */
export const MAX_PAGE = 10_000;

export const pageNumberSchema = z.coerce.number().int().min(1).max(MAX_PAGE);

export const paginationSchema = z.object({
  page: pageNumberSchema.default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Paginated<TItem> {
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function toPaginated<TItem>(
  items: TItem[],
  total: number,
  pagination: Pagination,
): Paginated<TItem> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

export const sortDirectionSchema = z.enum(["asc", "desc"]);
export type SortDirection = z.infer<typeof sortDirectionSchema>;
