/** How many cities the list shows at once; typing narrows the rest. */
export const MAX_CITY_SUGGESTIONS = 6;

/** Lower case without accents, so "sao" finds "São Paulo" and "manaus" finds "Manaus". */
export function foldCityName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
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
  if (cities.some((city) => foldCityName(city) === query) && query !== "") {
    return [];
  }
  const sorted = cities.toSorted(byName);
  const starting = sorted.filter((city) => foldCityName(city).startsWith(query));
  const containing = sorted.filter(
    (city) => !foldCityName(city).startsWith(query) && foldCityName(city).includes(query),
  );
  const matches = [...starting, ...containing];
  const capitalFirst =
    capital !== null && matches.includes(capital)
      ? [capital, ...matches.filter((city) => city !== capital)]
      : matches;
  return capitalFirst.slice(0, MAX_CITY_SUGGESTIONS);
}
