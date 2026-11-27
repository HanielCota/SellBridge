import { vi } from "vitest";
import { signPublicCall, signShopCall } from "../signing.ts";

/** One request as the fake Shopee received it. */
export interface RecordedRequest {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly json: unknown;
  readonly form: FormData | null;
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response>;

export const PARTNER_ID = "2001887";
export const PARTNER_KEY = "shpk-test-partner-key";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The documented refusal shape: `error` names the problem, `message` explains it. */
export function refusal(error: string, message: string, status = 200): Response {
  return jsonResponse({ request_id: "req-refused", error, message }, status);
}

/**
 * Checks what the Open API checks before answering: the partner id and the signature, over the
 * public base string, or the shop one when the call carries an access token.
 */
function gatewayRefusal(url: URL): Response | null {
  const query = url.searchParams;
  const timestamp = Number(query.get("timestamp"));
  const accessToken = query.get("access_token");
  const shopId = query.get("shop_id");
  const expected =
    accessToken === null || shopId === null
      ? signPublicCall({
          partnerId: PARTNER_ID,
          path: url.pathname,
          timestamp,
          partnerKey: PARTNER_KEY,
        })
      : signShopCall({
          partnerId: PARTNER_ID,
          path: url.pathname,
          timestamp,
          accessToken,
          shopId,
          partnerKey: PARTNER_KEY,
        });
  if (query.get("partner_id") !== PARTNER_ID || query.get("sign") !== expected) {
    return refusal("error_sign", "Wrong sign.", 403);
  }
  return null;
}

/**
 * A stand-in for the Shopee Open API, routed by "METHOD path" (query ignored). No real network
 * is used.
 */
export function fakeShopee(routes: Record<string, Responder>) {
  const calls: RecordedRequest[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const body = init?.body;
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      host: url.host,
      path: url.pathname,
      query: url.searchParams,
      json: typeof body === "string" ? JSON.parse(body) : null,
      form: body instanceof FormData ? body : null,
    };
    calls.push(request);
    const refused = gatewayRefusal(url);
    if (refused !== null) {
      return refused;
    }
    const responder = routes[`${request.method} ${url.pathname}`];
    if (responder === undefined) {
      return refusal("error_not_found", `unmapped ${request.method} ${url.pathname}`, 404);
    }
    return responder(request);
  });
  return { fetchImplementation, calls };
}
