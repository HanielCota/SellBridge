import { stripAccents } from "@sellbridge/shared/text";

/** How many cities the list shows at once; typing narrows the rest. */
export const MAX_CITY_SUGGESTIONS = 6;

/** Lower case without accents, so "sao" finds "São Paulo" and "manaus" finds "Manaus". */
export function foldCityName(name: string): string {
  return stripAccents(name).toLowerCase().trim();
}

function byName(first: string, second: string): number {
  return first.localeCompare(second, "pt-BR");
}

/**
 * The cities to suggest for what was typed: the capital first when it matches, then names that
 * start with the text, then names that contain it, each group in alphabetical order. An exact
 * match alone suggests nothing, so a picked city does not keep the list open.
 */
export function suggestCities(
  cities: readonly string[],
  typed: string,
  capital: string | null,
): readonly string[] {
  const query = foldCityName(typed);
  const folded = cities.toSorted(byName).map((city) => ({ city, key: foldCityName(city) }));
  if (query !== "" && folded.some(({ key }) => key === query)) {
    return [];
  }
  const starting = folded.filter(({ key }) => key.startsWith(query));
  const containing = folded.filter(({ key }) => !key.startsWith(query) && key.includes(query));
  const matches = [...starting, ...containing].map(({ city }) => city);
  const capitalFirst =
    capital !== null && matches.includes(capital)
      ? [capital, ...matches.filter((city) => city !== capital)]
      : matches;
  return capitalFirst.slice(0, MAX_CITY_SUGGESTIONS);
}
