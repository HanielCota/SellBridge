import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parseJsonText } from "@sellbridge/shared/http-body";
import { z } from "zod";
import { marketplaceError } from "../errors.ts";
import type { MarketplaceOrder } from "../types.ts";

/**
 * Wire formats of the simulated marketplace: authorization codes, order resources
 * and webhook signatures, each with its encoder and decoder/verifier.
 */
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
const ORDER_RESOURCE_PREFIX = "mock-order.";
const AUTHORIZATION_CODE_PREFIX = "mock.";

const consentPayloadSchema = z.object({
  shopName: z.string().trim().min(1).max(80),
  nonce: z.string().min(8),
});

const mockOrderSchema = z.object({
  externalOrderId: z.string().min(1),
  status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled", "returned"]),
  totalCents: z.number().int().nonnegative(),
  marketplaceFeeCents: z.number().int().nonnegative(),
  buyerName: z.string().nullable(),
  orderedAt: z.string(),
  items: z
    .array(
      z.object({
        externalListingId: z.string().min(1),
        title: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPriceCents: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export type MockOrder = z.infer<typeof mockOrderSchema>;

/** The simulated marketplace encodes the whole order in the webhook resource. */
export function encodeMockOrderResource(order: MockOrder): string {
  return `${ORDER_RESOURCE_PREFIX}${Buffer.from(JSON.stringify(order)).toString("base64url")}`;
}

export function decodeMockOrderResource(resource: string): MarketplaceOrder {
  if (!resource.startsWith(ORDER_RESOURCE_PREFIX)) {
    throw marketplaceError("Recurso de pedido inválido", { retryable: false });
  }
  const encoded = resource.slice(ORDER_RESOURCE_PREFIX.length);
  const json = parseJsonText(Buffer.from(encoded, "base64url").toString("utf8"));
  const parsed = mockOrderSchema.safeParse(json);
  if (!parsed.success) {
    throw marketplaceError("Pedido simulado em formato inválido", { retryable: false });
  }
  return { ...parsed.data, orderedAt: new Date(parsed.data.orderedAt) };
}

export function encodeMockAuthorizationCode(shopName: string): string {
  const payload = { shopName, nonce: randomBytes(8).toString("hex") };
  return `${AUTHORIZATION_CODE_PREFIX}${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

export function decodeMockAuthorizationCode(code: string) {
  if (!code.startsWith(AUTHORIZATION_CODE_PREFIX)) {
    return null;
  }
  const encoded = code.slice(AUTHORIZATION_CODE_PREFIX.length);
  const json = parseJsonText(Buffer.from(encoded, "base64url").toString("utf8"));
  const parsed = consentPayloadSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export function signMockWebhook(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Constant-time comparison of a received signature against the expected one. */
export function isValidMockSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signMockWebhook(rawBody, secret), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
