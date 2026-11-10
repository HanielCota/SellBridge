import type { SupplierPaymentBadge } from "@sellbridge/shared/shipment-payments";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const BADGE_TONES = {
  success: "bg-emerald-700 text-white",
  warning: "bg-amber-700 text-white",
  danger: "bg-destructive text-white",
  neutral: "bg-slate-600 text-white",
} as const;

export type PaymentBadgeTone = keyof typeof BADGE_TONES;

/** A solid status pill with its word: the same on every screen that shows a payment state. */
export function PaymentPill({ tone, children }: { tone: PaymentBadgeTone; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const PAYMENT_METHOD_WORDS: Record<string, string> = {
  bank_transfer: "Pix",
  pix: "Pix",
  credit_card: "cartão de crédito",
  debit_card: "cartão de débito",
  prepaid_card: "cartão pré-pago",
  account_money: "saldo do Mercado Pago",
};

/** "Pix", "cartão de crédito"…; null for a kind this screen does not know. */
export function paymentMethodWord(method: string | null): string | null {
  if (method === null) {
    return null;
  }
  return PAYMENT_METHOD_WORDS[method] ?? null;
}

function badgeText(badge: SupplierPaymentBadge, paidWord: string): string {
  if (badge.kind === "paid") {
    return `✓ ${paidWord} · ${formatAbsoluteTime(new Date(badge.paidAt))}`;
  }
  if (badge.kind === "waiting") {
    return "Aguardando pagamento";
  }
  if (badge.kind === "refunded") {
    return "Pagamento devolvido";
  }
  return "Pagamento por fora";
}

const BADGE_KIND_TONES: Record<SupplierPaymentBadge["kind"], PaymentBadgeTone> = {
  paid: "success",
  waiting: "warning",
  refunded: "danger",
  outside: "neutral",
};

/**
 * Whether the supplier was paid for the parcel, with the date: "Pago · 10/11/2026, 14:32" for
 * the supplier, "Fornecedor pago · …" for the reseller.
 */
export function SupplierPaymentBadgeView({
  badge,
  paidWord = "Pago",
}: {
  badge: SupplierPaymentBadge;
  paidWord?: string;
}) {
  return (
    <PaymentPill tone={BADGE_KIND_TONES[badge.kind]}>{badgeText(badge, paidWord)}</PaymentPill>
  );
}
