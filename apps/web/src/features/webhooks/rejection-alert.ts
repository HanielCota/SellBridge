import { logger } from "@sellbridge/shared/logger";

/** Refused Shopee pushes in one window that raise the alert. */
export const SHOPEE_REJECTION_ALERT_THRESHOLD = 20;
export const SHOPEE_REJECTION_WINDOW_IN_MS = 60 * 60 * 1000;

interface RejectionWindow {
  startedAtInMs: number;
  count: number;
  reported: boolean;
}

/**
 * Shopee signs each push over the exact callback URL registered in its console. One character of
 * difference from `APP_URL` refuses every push, so many refusals in a row get reported once per
 * window instead of staying in the warning logs.
 */
export function createShopeeRejectionAlert(now: () => number = Date.now) {
  const window: RejectionWindow = { startedAtInMs: now(), count: 0, reported: false };

  return function recordShopeeRejection(callbackUrl: string): void {
    const current = now();
    if (current - window.startedAtInMs >= SHOPEE_REJECTION_WINDOW_IN_MS) {
      window.startedAtInMs = current;
      window.count = 0;
      window.reported = false;
    }

    window.count += 1;
    if (window.reported || window.count < SHOPEE_REJECTION_ALERT_THRESHOLD) {
      return;
    }

    window.reported = true;
    logger.error("webhook.shopee_rejections", {
      reason: `${window.count} avisos da Shopee foram recusados na última hora. Confira se o endereço de avisos cadastrado no painel de parceiro da Shopee é exatamente ${callbackUrl}: um caractere diferente faz a Shopee assinar outro endereço e todo aviso é recusado.`,
      rejectedCount: window.count,
      problemKey: "webhook-rejected:shopee",
    });
  };
}
