import { z } from "zod";
import { normalizeCep, stateSchema, type ResolvedAddress } from "./cep.ts";
import { readJsonBody } from "./http-body.ts";
import { logger } from "./logger.ts";

export type CepLookupFailure = "INVALID_CEP" | "NOT_FOUND" | "PROVIDER_UNAVAILABLE";

export type CepLookupResult =
  | { ok: true; address: ResolvedAddress; provider: string; payload: unknown }
  | { ok: false; reason: CepLookupFailure };

export const CEP_FAILURE_MESSAGES: Record<CepLookupFailure, string> = {
  INVALID_CEP: "CEP inválido. Informe os 8 dígitos.",
  NOT_FOUND: "CEP não encontrado. Confira o número digitado.",
  PROVIDER_UNAVAILABLE:
    "Não foi possível consultar o CEP agora. Tente novamente em alguns instantes.",
};

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

type ProviderOutcome =
  | { kind: "found"; address: ResolvedAddress; payload: unknown }
  | { kind: "not_found" }
  | { kind: "unavailable" };

const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : null));

const brasilApiSchema = z.object({
  cep: z.string(),
  state: stateSchema,
  city: z.string().min(1),
  neighborhood: optionalText,
  street: optionalText,
});

const viaCepSuccessSchema = z.object({
  cep: z.string(),
  uf: stateSchema,
  localidade: z.string().min(1),
  bairro: optionalText,
  logradouro: optionalText,
});

const viaCepErrorSchema = z.object({ erro: z.union([z.literal(true), z.literal("true")]) });

async function fetchJson(
  fetchImplementation: FetchLike,
  url: string,
  timeoutMilliseconds: number,
): Promise<{ status: number; body: unknown } | null> {
  try {
    const response = await fetchImplementation(url, {
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
    const body = await readJsonBody(response);
    return { status: response.status, body };
  } catch (error) {
    // Network failure or timeout: the caller falls back to the next provider.
    logger.warn("cep.provider_unavailable", { provider: new URL(url).host, error });
    return null;
  }
}

async function queryBrasilApi(
  fetchImplementation: FetchLike,
  cep: string,
  timeoutMilliseconds: number,
): Promise<ProviderOutcome> {
  const result = await fetchJson(
    fetchImplementation,
    `https://brasilapi.com.br/api/cep/v2/${cep}`,
    timeoutMilliseconds,
  );
  if (!result) {
    return { kind: "unavailable" };
  }
  // BrasilAPI answers 404 both for unknown CEPs and when its upstreams fail, so the
  // caller confirms a 404 with the fallback provider before reporting "not found".
  if (result.status === 404) {
    return { kind: "not_found" };
  }
  if (result.status !== 200) {
    return { kind: "unavailable" };
  }
  const parsed = brasilApiSchema.safeParse(result.body);
  if (!parsed.success) {
    return { kind: "unavailable" };
  }
  const { state, city, neighborhood, street } = parsed.data;
  return {
    kind: "found",
    address: { cep, state, city, neighborhood, street },
    payload: result.body,
  };
}

async function queryViaCep(
  fetchImplementation: FetchLike,
  cep: string,
  timeoutMilliseconds: number,
): Promise<ProviderOutcome> {
  const result = await fetchJson(
    fetchImplementation,
    `https://viacep.com.br/ws/${cep}/json/`,
    timeoutMilliseconds,
  );
  if (!result) {
    return { kind: "unavailable" };
  }
  if (result.status !== 200) {
    return { kind: "unavailable" };
  }
  if (viaCepErrorSchema.safeParse(result.body).success) {
    return { kind: "not_found" };
  }
  const parsed = viaCepSuccessSchema.safeParse(result.body);
  if (!parsed.success) {
    return { kind: "unavailable" };
  }
  const { uf, localidade, bairro, logradouro } = parsed.data;
  return {
    kind: "found",
    address: { cep, state: uf, city: localidade, neighborhood: bairro, street: logradouro },
    payload: result.body,
  };
}

export interface CepLookupOptions {
  fetchImplementation?: FetchLike;
  timeoutMilliseconds?: number;
}

/** Resolves a CEP with BrasilAPI first and ViaCEP as fallback. */
export async function lookupCep(
  input: string,
  options: CepLookupOptions = {},
): Promise<CepLookupResult> {
  const cep = normalizeCep(input);
  if (!cep) {
    return { ok: false, reason: "INVALID_CEP" };
  }
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 5000;

  const primary = await queryBrasilApi(fetchImplementation, cep, timeoutMilliseconds);
  if (primary.kind === "found") {
    return { ok: true, address: primary.address, provider: "brasilapi", payload: primary.payload };
  }
  const fallback = await queryViaCep(fetchImplementation, cep, timeoutMilliseconds);
  if (fallback.kind === "found") {
    return { ok: true, address: fallback.address, provider: "viacep", payload: fallback.payload };
  }
  if (fallback.kind === "not_found") {
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (primary.kind === "not_found") {
    return { ok: false, reason: "NOT_FOUND" };
  }
  return { ok: false, reason: "PROVIDER_UNAVAILABLE" };
}
