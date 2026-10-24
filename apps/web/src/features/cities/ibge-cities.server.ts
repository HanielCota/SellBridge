import type { BrazilianState } from "@sellbridge/shared/brazilian-states";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";

export type FetchCities = (url: string, init: RequestInit) => Promise<Response>;

const IBGE_CITIES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";
/** The city field stays free text: past this, the seller just types without suggestions. */
const LOOKUP_TIMEOUT_MILLISECONDS = 4000;
const LOOKUP_ATTEMPTS = 2;
const RETRY_DELAY_MILLISECONDS = 300;
/** Bigger than the largest state (MG, 853 cities); a reply past it is not the list we asked for. */
const MAX_CITIES_PER_STATE = 1000;

const ibgeCitiesSchema = z
  .array(z.object({ nome: z.string().trim().min(1).max(100) }))
  .max(MAX_CITIES_PER_STATE);

/** The cities rarely change (a new one every few years): one lookup per state per process. */
const citiesByState = new Map<BrazilianState, readonly string[]>();

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** One request: the names on success, null on a transient failure, [] on a final one. */
async function requestCities(
  state: BrazilianState,
  fetchCities: FetchCities,
): Promise<readonly string[] | null> {
  try {
    const response = await fetchCities(`${IBGE_CITIES_URL}/${state}/municipios`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      logger.warn("cities.lookup_failed", { state, status: response.status });
      return isTransientStatus(response.status) ? null : [];
    }
    const parsed = ibgeCitiesSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.warn("cities.lookup_unexpected_reply", { state });
      return [];
    }
    return parsed.data.map((city) => city.nome);
  } catch (error) {
    logger.warn("cities.lookup_failed", { state, error });
    return null;
  }
}

/**
 * The state's cities from IBGE, for the billing city suggestions. A failure returns no
 * suggestions (logged) instead of an error: the field takes any typed city anyway.
 */
export async function listCitiesOfState(
  state: BrazilianState,
  fetchCities: FetchCities = fetch,
): Promise<readonly string[]> {
  const cached = citiesByState.get(state);
  if (cached !== undefined) {
    return cached;
  }
  for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt += 1) {
    const cities = await requestCities(state, fetchCities);
    if (cities !== null && cities.length > 0) {
      citiesByState.set(state, cities);
      return cities;
    }
    if (cities !== null) {
      return cities;
    }
    if (attempt < LOOKUP_ATTEMPTS) {
      await wait(RETRY_DELAY_MILLISECONDS * attempt);
    }
  }
  return [];
}

/** Tests only: forget what earlier lookups cached. */
export function clearCitiesCache(): void {
  citiesByState.clear();
}
