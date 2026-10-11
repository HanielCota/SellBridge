import { and, or, sql, type Column, type SQL } from "drizzle-orm";

/** Wraps user input in `%…%` for ILIKE, escaping the LIKE wildcards it may contain. */
export function containsPattern(search: string): string {
  const escaped = search.replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}

const ACCENTED = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const PLAIN = "aaaaaeeeeiiiiooooouuuucn";

/** Lowercased, without accents: how both sides of an accent-insensitive search compare. */
export function foldAccents(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function foldedColumn(column: Column): SQL {
  return sql`translate(lower(${column}), ${ACCENTED}, ${PLAIN})`;
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
