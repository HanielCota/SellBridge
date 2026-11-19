import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Header Bling signs each notification with (developer.bling.com.br/webhooks#tecnica). */
export const BLING_SIGNATURE_HEADER = "x-bling-signature-256";

const SIGNATURE_PREFIX = "sha256=";

/** Stock notifications: physical moves (`stock`) and reservations (`virtual_stock`). */
const STOCK_EVENTS: ReadonlySet<string> = new Set([
  "stock.created",
  "stock.updated",
  "stock.deleted",
  "virtual_stock.updated",
]);

/**
 * True when `signature` is `sha256=` + the hex HMAC-SHA256 of the raw body bytes, keyed with the
 * app's client secret, as Bling documents it. Compared in constant time. The bytes are hashed as
 * received: decoding first would drop a BOM or rewrite invalid UTF-8 and change what was signed.
 */
export function isValidBlingSignature(input: {
  rawBody: Uint8Array;
  signature: string | null;
  clientSecret: string;
}): boolean {
  if (input.clientSecret === "") {
    return false;
  }
  if (input.signature === null || !input.signature.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const received = Buffer.from(
    input.signature.slice(SIGNATURE_PREFIX.length).trim().toLowerCase(),
    "utf8",
  );
  const expected = Buffer.from(
    createHmac("sha256", input.clientSecret).update(input.rawBody).digest("hex"),
    "utf8",
  );
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(received, expected);
}

const blingNoticeSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  event: z.string().trim().min(1).max(100),
  companyId: z.string().trim().min(1).max(100),
  data: z.unknown(),
});

const stockDataSchema = z.object({
  produto: z.object({ id: z.number().int().positive() }),
});

export type BlingNotice =
  | { kind: "stock"; eventId: string; companyId: string; erpProductId: number }
  | { kind: "other"; event: string };

/** Reads a verified notification: which company's product had its stock changed, if any. */
export function parseBlingNotice(payload: unknown): BlingNotice | null {
  const notice = blingNoticeSchema.safeParse(payload);
  if (!notice.success) {
    return null;
  }
  if (!STOCK_EVENTS.has(notice.data.event)) {
    return { kind: "other", event: notice.data.event };
  }
  const data = stockDataSchema.safeParse(notice.data.data);
  if (!data.success) {
    return null;
  }
  return {
    kind: "stock",
    eventId: notice.data.eventId,
    companyId: notice.data.companyId,
    erpProductId: data.data.produto.id,
  };
}
