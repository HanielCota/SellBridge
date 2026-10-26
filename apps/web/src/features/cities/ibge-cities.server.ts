import type { BrazilianState } from "@sellbridge/shared/brazilian-states";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { createAsyncCache } from "@/lib/server/async-cache";

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

/** Asks again only after a transient failure; no suggestions when every attempt fails. */
async function requestWithRetry(
  state: BrazilianState,
  fetchCities: FetchCities,
): Promise<readonly string[]> {
  for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt += 1) {
    const cities = await requestCities(state, fetchCities);
    if (cities !== null) {
      return cities;
    }
    if (attempt < LOOKUP_ATTEMPTS) {
      await wait(RETRY_DELAY_MILLISECONDS * attempt);
    }
  }
  return [];
}

/** Successful lists last a day; an outage has a short cooldown before another attempt. */
export function createCitiesLookup(fetchCities: FetchCities = fetch, now: () => number = Date.now) {
  return createAsyncCache<BrazilianState, readonly string[]>({
    load: (state) => requestWithRetry(state, fetchCities),
    maxEntries: 27,
    ttlMilliseconds: (cities) => (cities.length > 0 ? 24 * 60 * 60_000 : 30_000),
    now,
  });
}

export const listCitiesOfState = createCitiesLookup();
