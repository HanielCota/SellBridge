/** Wraps user input in `%…%` for ILIKE, escaping the LIKE wildcards it may contain. */
export function containsPattern(search: string): string {
  const escaped = search.replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}
