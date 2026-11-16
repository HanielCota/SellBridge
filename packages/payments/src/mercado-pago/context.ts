import type { Database } from "@sellbridge/database/client";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import type { MercadoPagoSettings } from "./settings.ts";

/** What every Mercado Pago step needs; the web app and the worker pass their own. */
export interface MercadoPagoContext {
  readonly database: Database;
  readonly cipher: TokenCipher;
  readonly settings: MercadoPagoSettings;
}
