import { z } from "zod";

/** C0 controls and DEL, except tab and line breaks; NUL alone makes Postgres refuse the row. */
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "");
}

/**
 * Text typed or pasted by people (and read from CSV): invisible control characters are dropped
 * before any other rule, so a pasted NUL never turns a save into a database error. NFC makes "É"
 * typed as one character or as "E" plus an accent the same text (a SKU saved on a Mac and one
 * typed on Windows must match).
 */
export function freeText() {
  return z.string().overwrite((value) => stripControlCharacters(value).normalize("NFC"));
}

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
