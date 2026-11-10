import { marketplaceAuthError, isMarketplaceError } from "../errors.ts";
import { BLING_JWT_HEADERS, blingRequest, type BlingHttpOptions } from "./http.ts";
import { blingTokenResponseSchema } from "./schemas.ts";

export const BLING_AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
export const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

export interface BlingAppCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface BlingTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

/**
 * The consent page. Bling ignores `redirect_uri` and `scope` here: both come from the app
 * registration, so the callback address and scopes are set there.
 */
export function blingAuthorizationUrl(input: { clientId: string; state: string }): string {
  const url = new URL(BLING_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("state", input.state);
  return url.toString();
}

function basicCredentials(credentials: BlingAppCredentials): string {
  const encoded = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString(
    "base64",
  );
  return `Basic ${encoded}`;
}

async function requestTokens(
  options: BlingHttpOptions & { credentials: BlingAppCredentials; now?: () => number },
  body: URLSearchParams,
): Promise<BlingTokens> {
  const now = options.now ?? Date.now;
  // The credentials go only in the header: Bling refuses them in the body.
  const response = await blingRequest(options, {
    url: BLING_TOKEN_URL,
    init: {
      method: "POST",
      headers: {
        ...BLING_JWT_HEADERS,
        Accept: "1.0",
        Authorization: basicCredentials(options.credentials),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
    schema: blingTokenResponseSchema,
  });
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: new Date(now() + response.expires_in * 1000),
  };
}

/** Trades the consent code (valid for 30 seconds) for the account's tokens. */
export async function exchangeBlingCode(
  options: BlingHttpOptions & { credentials: BlingAppCredentials; now?: () => number },
  code: string,
): Promise<BlingTokens> {
  return requestTokens(options, new URLSearchParams({ grant_type: "authorization_code", code }));
}

/**
 * New tokens from the refresh token (valid for 30 days). A refused refresh token (400 or 401)
 * means the supplier must connect again; anything else is passing and tried later.
 */
export async function refreshBlingTokens(
  options: BlingHttpOptions & { credentials: BlingAppCredentials; now?: () => number },
  refreshToken: string,
): Promise<BlingTokens> {
  try {
    return await requestTokens(
      options,
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    );
  } catch (error) {
    if (isMarketplaceError(error) && error.details.status === 400) {
      throw marketplaceAuthError("A conta do Bling precisa ser conectada de novo");
    }
    throw error;
  }
}
