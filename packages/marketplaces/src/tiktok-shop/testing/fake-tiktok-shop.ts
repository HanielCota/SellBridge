import { vi } from "vitest";
import { signRequest } from "../signing.ts";

/** One request as the fake TikTok Shop received it. */
export interface RecordedRequest {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly accessTokenHeader: string | null;
  readonly json: unknown;
  readonly form: FormData | null;
}

export type Responder = (request: RecordedRequest) => Response | Promise<Response>;

export const APP_KEY = "29a39d";
export const APP_SECRET = "e59af819cc";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseBody(body: RequestInit["body"]): {
  json: unknown;
  form: FormData | null;
  raw: string | null;
} {
  if (typeof body === "string") {
    return { json: JSON.parse(body), form: null, raw: body };
  }
  if (body instanceof FormData) {
    return { json: null, form: body, raw: null };
  }
  return { json: null, form: null, raw: null };
}

/**
 * Checks what the real Open API checks before answering: the signature over path, sorted query
 * and exact body, with the app secret; the access token only in its header. A bad request gets
 * the documented refusal instead of the route's answer.
 */
function gatewayRefusal(url: URL, raw: string | null): Response | null {
  const sign = url.searchParams.get("sign");
  const expected = signRequest({
    path: url.pathname,
    query: url.searchParams,
    body: raw,
    appSecret: APP_SECRET,
  });
  if (sign !== expected || url.searchParams.get("app_key") !== APP_KEY) {
    return jsonResponse({
      code: 106001,
      message: "Invalid credentials. The sign is invalid.",
      data: null,
    });
  }
  if (url.searchParams.has("access_token")) {
    return jsonResponse({
      code: 36009004,
      message: "access_token must be in the header",
      data: null,
    });
  }
  return null;
}

/**
 * A stand-in for open-api.tiktokglobalshop.com, auth.tiktok-shops.com and image hosts, routed by
 * "METHOD host/path" (query ignored, longest route first). No real network is used.
 */
export function fakeTikTokShop(routes: Record<string, Responder>) {
  const calls: RecordedRequest[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = new Headers(init?.headers);
    const body = parseBody(init?.body);
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      host: url.host,
      path: url.pathname,
      query: url.searchParams,
      accessTokenHeader: headers.get("x-tts-access-token"),
      json: body.json,
      form: body.form,
    };
    calls.push(request);
    if (url.host === "open-api.tiktokglobalshop.com") {
      const refused = gatewayRefusal(url, body.raw);
      if (refused !== null) {
        return refused;
      }
    }
    const key = Object.keys(routes)
      .toSorted((left, right) => right.length - left.length)
      .find((route) => route === `${request.method} ${url.host}${url.pathname}`);
    const responder = key === undefined ? undefined : routes[key];
    if (responder === undefined) {
      return jsonResponse({
        code: 36009009,
        message: `unmapped ${request.method} ${url.host}${url.pathname}`,
      });
    }
    return responder(request);
  });
  return { fetchImplementation, calls };
}
