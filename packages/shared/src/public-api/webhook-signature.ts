import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature of webhook requests, sent in the `SellBridge-Signature` header:
 *
 *   SellBridge-Signature: t=1767225600,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
 *
 * `v1` is the hex HMAC-SHA256 of `"<t>.<raw body>"` with the endpoint secret (`whsec_...`).
 * The timestamp is signed too, so an old request cannot be replayed later: receivers reject
 * signatures outside a tolerance window. Integrators copy this logic, so it stays plain.
 */
export const WEBHOOK_SIGNATURE_HEADER = "SellBridge-Signature";
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function hmacHex(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** `timestamp` in Unix seconds. Returns the header value. */
export function signWebhookPayload(input: { secret: string; timestamp: number; body: string }) {
  return `t=${input.timestamp},v1=${hmacHex(input.secret, input.timestamp, input.body)}`;
}

function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestampPart = parts.find(([name]) => name === "t");
  const timestamp = Number(timestampPart?.[1]);
  if (!Number.isInteger(timestamp)) {
    return null;
  }
  const signatures = parts.flatMap(([name, value]) => (name === "v1" && value ? [value] : []));
  return { timestamp, signatures };
}

/** A v1 signature is exactly 64 lowercase hex digits (HMAC-SHA256). */
const SIGNATURE_HEX = /^[0-9a-f]{64}$/;

function sameHex(expected: string, received: string): boolean {
  // Buffer.from(hex) stops at the first non-hex character, so "<valid>zz" would still match.
  if (!SIGNATURE_HEX.test(received)) {
    return false;
  }
  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(received, "hex");
  // timingSafeEqual needs equal lengths; the length itself is not a secret.
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

/**
 * Checks a received webhook: `body` is the raw request body (before any JSON parsing),
 * `now` the current time. True only when one `v1` matches and `t` is within the tolerance.
 */
export function verifyWebhookSignature(input: {
  secret: string;
  header: string;
  body: string;
  toleranceSeconds?: number;
  now?: Date;
}): boolean {
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) {
    return false;
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) {
    return false;
  }
  const expected = hmacHex(input.secret, parsed.timestamp, input.body);
  return parsed.signatures.some((signature) => sameHex(expected, signature));
}
