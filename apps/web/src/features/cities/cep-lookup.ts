import { parseState, type BrazilianState } from "@sellbridge/shared/brazilian-states";
import { queryOptions, skipToken } from "@tanstack/react-query";
import { z } from "zod";

/**
 * Fills an address from its CEP with ViaCEP (https://viacep.com.br), which also gives the
 * city's IBGE code an NF-e needs. Asked from the browser (ViaCEP answers cross-origin): only the
 * CEP leaves the page, and every field stays editable when the lookup fails.
 */

const VIA_CEP_URL = "https://viacep.com.br/ws";
const LOOKUP_TIMEOUT_MILLISECONDS = 4000;
const CEP_LENGTH = 8;
const DAY_MILLISECONDS = 24 * 60 * 60_000;

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
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== CEP_LENGTH) {
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
  } catch {
    // Offline, timed out or blocked: the form says so and the fields stay free to type.
    return { kind: "unavailable" };
  }
}

/** One lookup per CEP; an address does not change within a day, a failure is retried soon. */
export const cepLookupQueryOptions = (cep: string) => {
  const digits = cep.replace(/\D/g, "");
  return queryOptions({
    queryKey: ["cep", digits],
    queryFn: digits.length === CEP_LENGTH ? () => lookUpCep(digits) : skipToken,
    staleTime: (query) => (query.state.data?.kind === "unavailable" ? 30_000 : DAY_MILLISECONDS),
    gcTime: DAY_MILLISECONDS,
    retry: false,
  });
};
