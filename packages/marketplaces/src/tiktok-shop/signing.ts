import { createHmac, timingSafeEqual } from "node:crypto";

/** Query keys the signature leaves out ("Sign your API request", step 2). */
const UNSIGNED_QUERY_KEYS: ReadonlySet<string> = new Set(["sign", "access_token"]);

export interface SignatureInput {
  /** Request path after the host, e.g. `/authorization/202309/shops`. */
  readonly path: string;
  readonly query: URLSearchParams;
  /** The exact body bytes sent; null for GET and for multipart uploads, which are not signed. */
  readonly body: string | null;
  readonly appSecret: string;
}

function hmacHex(secret: string, text: string): string {
  return createHmac("sha256", secret).update(text, "utf8").digest("hex");
}

/**
 * The `sign` query parameter: HMAC-SHA256 (key = app secret) over
 * `secret + path + sorted {key}{value} + body + secret`, in lowercase hex.
 */
export function signRequest(input: SignatureInput): string {
  const keys = [...new Set(input.query.keys())]
    .filter((key) => !UNSIGNED_QUERY_KEYS.has(key))
    .toSorted();
  const parameters = keys.map((key) => `${key}${input.query.get(key) ?? ""}`).join("");
  const signed = `${input.path}${parameters}${input.body ?? ""}`;
  return hmacHex(input.appSecret, `${input.appSecret}${signed}${input.appSecret}`);
}

/**
 * Checks the `Authorization` header of a webhook: HMAC-SHA256 (key = app secret) over
 * `app_key + raw body`, lowercase hex, compared in constant time.
 */
export function isValidWebhookSignature(input: {
  appKey: string;
  appSecret: string;
  rawBody: string;
  signature: string | null;
}): boolean {
  if (input.signature === null || input.signature.trim() === "") {
    return false;
  }
  const expected = Buffer.from(hmacHex(input.appSecret, `${input.appKey}${input.rawBody}`), "utf8");
  const received = Buffer.from(input.signature.trim(), "utf8");
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}
