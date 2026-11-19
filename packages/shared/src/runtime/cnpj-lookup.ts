import { z } from "zod";
import type { CnpjLookupResult } from "../domain/supplier-approval.ts";
import { logger } from "./logger.ts";

/**
 * BrasilAPI's company endpoint (https://brasilapi.com.br/docs#tag/CNPJ, read 18/11/2026): free,
 * no key, served from the Receita's monthly open data through Minha Receita. No published rate
 * limit and no service level, so every failure counts as "down" and is retried later.
 */
export const DEFAULT_CNPJ_LOOKUP_URL = "https://brasilapi.com.br/api/cnpj/v1";
/** BrasilAPI itself gives up after 5 seconds and answers 503. */
const LOOKUP_TIMEOUT_IN_MS = 6000;
/** 2 = ATIVA; 1 nula, 3 suspensa, 4 inapta, 8 baixada. */
const ACTIVE_REGISTRATION = 2;
const MAX_RESPONSE_TEXT_LENGTH = 300;

const companySchema = z.object({
  razao_social: z.string().trim().min(1).max(MAX_RESPONSE_TEXT_LENGTH),
  situacao_cadastral: z.coerce.number().int(),
  descricao_situacao_cadastral: z.string().trim().max(MAX_RESPONSE_TEXT_LENGTH).nullish(),
});

export type CnpjLookup = (cnpj: string) => Promise<CnpjLookupResult>;

interface CnpjLookupOptions {
  readonly baseUrl: string;
  readonly fetchImplementation?: typeof fetch;
}

async function readCompany(response: Response): Promise<CnpjLookupResult> {
  const parsed = companySchema.safeParse(await response.json());
  if (!parsed.success) {
    logger.warn("cnpj_lookup.unexpected_body", { issues: parsed.error.issues.length });
    return { outcome: "unavailable" };
  }
  const company = parsed.data;
  return {
    outcome: company.situacao_cadastral === ACTIVE_REGISTRATION ? "active" : "inactive",
    legalName: company.razao_social,
    registrationStatus: company.descricao_situacao_cadastral ?? String(company.situacao_cadastral),
  };
}

/**
 * Asks the public CNPJ query about one company. Never throws: a timeout, a network error, a
 * rate limit or an unexpected answer all come back as `unavailable`.
 */
export function createCnpjLookup(options: CnpjLookupOptions): CnpjLookup {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  return async function lookUpCnpj(cnpj) {
    try {
      const response = await fetchImplementation(`${baseUrl}/${encodeURIComponent(cnpj)}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_IN_MS),
      });
      if (response.status === 404) {
        return { outcome: "not_found" };
      }
      if (response.status === 400) {
        return { outcome: "unsupported" };
      }
      if (!response.ok) {
        logger.warn("cnpj_lookup.failed", { status: response.status });
        return { outcome: "unavailable" };
      }
      return await readCompany(response);
    } catch (error) {
      logger.warn("cnpj_lookup.unreachable", { error });
      return { outcome: "unavailable" };
    }
  };
}
