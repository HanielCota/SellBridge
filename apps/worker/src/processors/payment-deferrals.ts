import type { Database } from "@sellbridge/database";
import {
  clearShipmentPaymentDeferral,
  markShipmentPaymentDeferred,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";

/**
 * How long a provider may stay out of reach before the team is told: 24 rounds of five minutes.
 * A shorter outage passes on its own; past this, refunds and releases are waiting on it.
 */
export const PAYMENT_DEFERRAL_LIMIT_IN_MS = 2 * 60 * 60 * 1000;
export const PAYMENT_PROVIDER_STUCK_EVENT = "payments.provider_stuck";

const PROVIDER_NAMES = { asaas: "Asaas", mercado_pago: "Mercado Pago" } as const;

type PaymentProvider = keyof typeof PROVIDER_NAMES;

export interface PaymentDeferrals {
  /** This round could not reach the provider about the payment: logs `event` as a passing `warn`. */
  deferred: (event: string, paymentId: string, error: unknown) => Promise<void>;
  /** This round reached the provider about the payment. */
  reached: (paymentId: string) => Promise<void>;
  /** After the round: one problem for the team when payments waited past the limit. */
  report: () => void;
}

/**
 * Follows, across rounds, the payments a provider outage keeps waiting. Each deferral stays a
 * warning; once any payment has waited past the limit, the round logs one error per provider
 * (the admin Problemas page groups the rounds on one row, the alert webhook hears it).
 */
export function trackPaymentDeferrals(
  database: Database,
  input: { provider: PaymentProvider; now: Date },
): PaymentDeferrals {
  const stuck = new Set<string>();
  let oldest: Date | null = null;
  return {
    deferred: async (event, paymentId, error) => {
      const since = await markShipmentPaymentDeferred(database, { paymentId, now: input.now });
      logger.warn(event, { shipmentPaymentId: paymentId, error });
      if (input.now.getTime() - since.getTime() < PAYMENT_DEFERRAL_LIMIT_IN_MS) {
        return;
      }
      stuck.add(paymentId);
      oldest = oldest === null || since < oldest ? since : oldest;
    },
    reached: async (paymentId) => clearShipmentPaymentDeferral(database, paymentId),
    report: () => {
      if (stuck.size === 0 || oldest === null) {
        return;
      }
      const name = PROVIDER_NAMES[input.provider];
      logger.error(PAYMENT_PROVIDER_STUCK_EVENT, {
        reason: `${name} sem responder há mais de 2 horas: ${stuck.size} pagamento(s) esperando conferência, liberação ou devolução. Volta sozinho quando o ${name} responder; se passar de um dia, fale com o suporte do ${name}.`,
        provider: input.provider,
        waitingPayments: stuck.size,
        oldestDeferredSince: oldest.toISOString(),
      });
    },
  };
}
