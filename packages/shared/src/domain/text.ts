/** Combining marks only, so `^`, backtick and other plain symbols survive. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Drops accents and keeps the base letters: "Ångström" → "Angstrom". */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "");
}
