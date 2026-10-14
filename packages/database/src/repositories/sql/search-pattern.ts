import { and, or, sql, type Column, type SQL } from "drizzle-orm";

/**
 * Wraps user input in `%…%` for ILIKE, escaping the LIKE wildcards it may contain. The NUL
 * character (`?q=a%00`) is dropped: Postgres refuses it in text and the search would fail.
 */
export function containsPattern(search: string): string {
  const escaped = search
    .replaceAll(String.fromCharCode(0), "")
    .replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}

/** Combining marks only, so `^`, backtick and other plain symbols in a SKU survive. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lowercased, without accents: how the search text is folded before it meets
 * `lower(unaccent(column))` in Postgres ("Ñ" → "n", "Ångström" → "angstrom").
 */
export function foldAccents(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** Needs the `unaccent` extension, created by a migration. */
function foldedColumn(column: Column): SQL {
  return sql`lower(unaccent(${column}))`;
}

/**
 * Every word of the search must appear in at least one of the columns, ignoring case and
 * accents: "calca verde" finds "Calça jeans slim - Verde".
 */
export function matchesEveryWord(search: string, columns: Column[]): SQL | undefined {
  const words = search.split(/\s+/).filter((word) => word.length > 0);
  return and(
    ...words.map((word) => {
      const pattern = containsPattern(foldAccents(word));
      return or(...columns.map((column) => sql`${foldedColumn(column)} like ${pattern}`));
    }),
  );
}
