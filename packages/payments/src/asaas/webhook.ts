import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Asaas's limits for a webhook's `authToken`. */
export const ASAAS_WEBHOOK_TOKEN_MIN_LENGTH = 32;
export const ASAAS_WEBHOOK_TOKEN_MAX_LENGTH = 255;

/** The header Asaas sends the webhook's `authToken` in. */
export const ASAAS_WEBHOOK_TOKEN_HEADER = "asaas-access-token";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Whether a notice carries SellBridge's webhook token. Both sides are hashed first, so the
 * comparison takes the same time whatever was sent.
 */
export function isValidAsaasWebhookToken(received: string | null, expected: string): boolean {
  if (received === null || received === "" || expected.length < ASAAS_WEBHOOK_TOKEN_MIN_LENGTH) {
    return false;
  }
  return timingSafeEqual(digest(received), digest(expected));
}

/**
 * The parts of an Asaas notice SellBridge reads. Everything else is ignored, and the payment is
 * always read back from Asaas: the notice only says which one to look at.
 */
const asaasWebhookEventSchema = z.object({
  /** Unique per event: a notice delivered twice carries the same id. */
  id: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  account: z.object({ id: z.string().min(1).max(200) }).nullish(),
  payment: z.object({ id: z.string().min(1).max(200) }).nullish(),
});

export type AsaasWebhookEvent =
  | {
      readonly kind: "payment";
      readonly eventId: string;
      readonly paymentId: string;
      readonly accountId: string | null;
    }
  | { readonly kind: "account_status"; readonly eventId: string; readonly accountId: string }
  | { readonly kind: "ignored"; readonly eventId: string; readonly event: string };

/**
 * Reads a notice's body: a payment to read back, an account whose approval changed, or an event
 * SellBridge does not use. Returns null when the body is not an Asaas notice.
 */
export function readAsaasWebhookEvent(body: unknown): AsaasWebhookEvent | null {
  const parsed = asaasWebhookEventSchema.safeParse(body);
  return parsed.success ? webhookEventFrom(parsed.data) : null;
}

function webhookEventFrom(notice: z.infer<typeof asaasWebhookEventSchema>): AsaasWebhookEvent {
  const { id: eventId, event, account, payment } = notice;
  const accountId = account?.id ?? null;
  if (event.startsWith("PAYMENT_") && payment !== null && payment !== undefined) {
    return { kind: "payment", eventId, paymentId: payment.id, accountId };
  }
  if (event.startsWith("ACCOUNT_STATUS_") && accountId !== null) {
    return { kind: "account_status", eventId, accountId };
  }
  return { kind: "ignored", eventId, event };
}
