import type { Database } from "@sellbridge/database/client";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import type { FetchLike } from "./http.ts";
import type { AsaasSettings } from "./settings.ts";

/** What every Asaas step needs; the web app and the worker pass their own. */
export interface AsaasContext {
  readonly database: Database;
  readonly cipher: TokenCipher;
  readonly settings: AsaasSettings;
  /** Injected in tests; defaults to the global fetch. */
  readonly fetchImplementation?: FetchLike;
}
