import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Checks Mercado Pago's `x-signature` header (`ts=...,v1=...`): an HMAC-SHA256 of the manifest
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with the application's secret signature.
 * A part whose value is missing is left out of the manifest, as Mercado Pago does.
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function isValidMercadoPagoSignature(input: {
  secret: string;
  signatureHeader: string | null;
  requestIdHeader: string | null;
  dataId: string | null;
}): boolean {
  if (input.signatureHeader === null) {
    return false;
  }
  const parts = signatureParts(input.signatureHeader);
  if (parts.ts === undefined || parts.v1 === undefined) {
    return false;
  }
  const manifest = [
    input.dataId === null || input.dataId === "" ? "" : `id:${input.dataId.toLowerCase()};`,
    input.requestIdHeader === null || input.requestIdHeader === ""
      ? ""
      : `request-id:${input.requestIdHeader};`,
    `ts:${parts.ts};`,
  ].join("");
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const received = parts.v1.toLowerCase();
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function signatureParts(header: string): { ts?: string; v1?: string } {
  const parts: { ts?: string; v1?: string } = {};
  for (const piece of header.split(",")) {
    const separator = piece.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = piece.slice(0, separator).trim();
    const value = piece.slice(separator + 1).trim();
    if (key === "ts") parts.ts = value;
    if (key === "v1") parts.v1 = value;
  }
  return parts;
}

/** Signs a notice the way Mercado Pago does; used by the browser tests' stand-in. */
export function mercadoPagoSignatureFor(input: {
  secret: string;
  dataId: string;
  requestId: string;
  ts: string;
}): string {
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${input.ts};`;
  const v1 = createHmac("sha256", input.secret).update(manifest).digest("hex");
  return `ts=${input.ts},v1=${v1}`;
}
