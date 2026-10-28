/** The last option of "O que você vende": opens a text field for a niche outside the catalog. */
export const OTHER_NICHE = "Outra";

export interface NicheChoice {
  /** A catalog category name, or `OTHER_NICHE`. */
  choice: string;
  /** The typed niche when `choice` is `OTHER_NICHE`, else empty. */
  custom: string;
}

/**
 * Splits the saved niche into the list choice and the typed text. Niches saved before the list
 * (free text) that match no category open as "Outra" with the text kept, so nothing is lost.
 */
export function nicheChoice(niche: string, categoryNames: readonly string[]): NicheChoice {
  const trimmed = niche.trim();
  const match = categoryNames.find(
    (name) => name.localeCompare(trimmed, "pt-BR", { sensitivity: "base" }) === 0,
  );
  if (match !== undefined) {
    return { choice: match, custom: "" };
  }
  if (trimmed === "") {
    return { choice: "", custom: "" };
  }
  return { choice: OTHER_NICHE, custom: niche };
}

/** The niche saved for a choice: the category name, or the typed text for "Outra". */
export function nicheValue({ choice, custom }: NicheChoice): string {
  return choice === OTHER_NICHE ? custom : choice;
}
