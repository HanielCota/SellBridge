import { readTextWithin } from "@sellbridge/shared/http-body";

/** A form with one short token field: anything bigger is not the supplier page's form. */
const MAX_FORM_BYTES = 1024;

/**
 * The supplier link's token for actions that leave the page (the marketplace label): sent in a
 * POST body, never in a URL, where browser history, proxies and access logs would keep a 30-day
 * key to the buyer's address. Null when the request carries none.
 */
export async function readSupplierToken(request: Request): Promise<string | null> {
  if (request.method !== "POST") {
    return null;
  }
  const body = await readTextWithin(request, MAX_FORM_BYTES);
  if (body === null) {
    return null;
  }
  const token = new URLSearchParams(body).get("token");
  return token === null || token === "" ? null : token;
}

/** Whether a request still puts a token in its URL (an old link): refused, never read. */
export function hasTokenInUrl(request: Request): boolean {
  return new URL(request.url).searchParams.has("token");
}
