import { readTextWithin } from "@sellbridge/shared/http-body";

/** A form with a few short fields (a token, or two ids): anything bigger is not our form. */
const MAX_FORM_BYTES = 1024;

/** The label form's fields, read once; null when the request carries no form. */
export async function readLabelForm(request: Request): Promise<URLSearchParams | null> {
  if (request.method !== "POST") {
    return null;
  }
  const body = await readTextWithin(request, MAX_FORM_BYTES);
  return body === null ? null : new URLSearchParams(body);
}

/**
 * The supplier link's token for actions that leave the page (the marketplace label): sent in a
 * POST body, never in a URL, where browser history, proxies and access logs would keep a 30-day
 * key to the buyer's address. Null when the form carries none.
 */
export function tokenOf(form: URLSearchParams | null): string | null {
  const token = form?.get("token") ?? null;
  return token === null || token === "" ? null : token;
}

/** Whether a request still puts a token in its URL (an old link): refused, never read. */
export function hasTokenInUrl(request: Request): boolean {
  return new URL(request.url).searchParams.has("token");
}
