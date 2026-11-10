import { completeCepDigits } from "@sellbridge/shared/billing-address";
import { parseState, type BrazilianState } from "@sellbridge/shared/brazilian-states";
import { queryOptions, skipToken } from "@tanstack/react-query";
import { z } from "zod";
import { reportRouteError } from "@/lib/report-route-error";

/**
 * Fills an address from its CEP with ViaCEP (https://viacep.com.br), which also gives the
 * city's IBGE code an NF-e needs. Asked from the browser (ViaCEP answers cross-origin): only the
 * CEP leaves the page, and every field stays editable when the lookup fails.
 */

const VIA_CEP_URL = "https://viacep.com.br/ws";
const LOOKUP_TIMEOUT_MILLISECONDS = 4000;
const DAY_MILLISECONDS = 24 * 60 * 60_000;
const RETRY_UNAVAILABLE_AFTER_MILLISECONDS = 30_000;

export type FetchCep = (url: string, init: RequestInit) => Promise<Response>;

export interface CepAddress {
  readonly street: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: BrazilianState;
  readonly ibgeCode: string;
}

export type CepLookupResult =
  | { readonly kind: "found"; readonly address: CepAddress }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

const viaCepFoundSchema = z.object({
  logradouro: z.string().trim().max(200),
  bairro: z.string().trim().max(100),
  localidade: z.string().trim().min(1).max(100),
  uf: z.string().trim(),
  ibge: z
    .string()
    .trim()
    .regex(/^\d{7}$/),
});
/** ViaCEP answers 200 with `{ "erro": "true" }` (or `true`) for a CEP that does not exist. */
const viaCepMissingSchema = z.object({ erro: z.union([z.literal(true), z.literal("true")]) });

/** ViaCEP's JSON as an address, or what went wrong; anything unexpected reads as unavailable. */
export function parseViaCepReply(body: unknown): CepLookupResult {
  if (viaCepMissingSchema.safeParse(body).success) {
    return { kind: "not_found" };
  }
  const parsed = viaCepFoundSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: "unavailable" };
  }
  const state = parseState(parsed.data.uf);
  if (state === null) {
    return { kind: "unavailable" };
  }
  return {
    kind: "found",
    address: {
      street: parsed.data.logradouro,
      neighborhood: parsed.data.bairro,
      city: parsed.data.localidade,
      state,
      ibgeCode: parsed.data.ibge,
    },
  };
}

/** The CEP's address; never throws, since the supplier can always type it instead. */
export async function lookUpCep(cep: string, fetchCep: FetchCep = fetch): Promise<CepLookupResult> {
  const digits = completeCepDigits(cep);
  if (digits === null) {
    return { kind: "not_found" };
  }
  try {
    const response = await fetchCep(`${VIA_CEP_URL}/${digits}/json/`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MILLISECONDS),
    });
    if (response.status === 400) {
      return { kind: "not_found" };
    }
    if (!response.ok) {
      return { kind: "unavailable" };
    }
    return parseViaCepReply(await response.json());
  } catch (error) {
    // Offline, timed out or blocked is expected and only shown on the form; anything else is a bug.
    if (!isNetworkFailure(error)) {
      await reportRouteError(error, "cep-lookup");
    }
    return { kind: "unavailable" };
  }
}

/** What `fetch` throws when the request never got an answer: no network, a timeout, a block. */
function isNetworkFailure(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  // A body that is not JSON (a captive portal page, say) is the service failing, not our code.
  return error instanceof TypeError || error instanceof SyntaxError;
}

/** One lookup per CEP; an address does not change within a day, a failure is retried soon. */
export const cepLookupQueryOptions = (cep: string) => {
  const digits = completeCepDigits(cep);
  return queryOptions({
    queryKey: ["cep", digits ?? cep],
    queryFn: digits === null ? skipToken : () => lookUpCep(digits),
    staleTime: (query) =>
      query.state.data?.kind === "unavailable"
        ? RETRY_UNAVAILABLE_AFTER_MILLISECONDS
        : DAY_MILLISECONDS,
    gcTime: DAY_MILLISECONDS,
    retry: false,
  });
};
