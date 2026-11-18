import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { buyerAddressNoticeCopy } from "@/features/stores/buyer-address-copy";
import { useRecheckBuyerAddress } from "@/features/stores/use-recheck-buyer-address";
import type { StoreWithActivity } from "./store-list";
import { formatSmartDate } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const NOTICE_TONES = {
  danger: "bg-destructive/[0.06] ring-destructive/25",
  warning: "bg-amber-500/[0.07] ring-amber-500/30",
} as const;

/**
 * Under a Mercado Livre store whose account buys at its supplier's address (or may): what goes
 * wrong, how to fix it on Mercado Livre, and the one button to check again.
 */
export function StoreBuyerAddressNotice({
  store,
  storeName,
}: {
  store: StoreWithActivity;
  storeName: string;
}) {
  const recheck = useRecheckBuyerAddress();
  const check = store.buyerAddress;
  if (store.status !== "connected" || check === null) {
    return null;
  }
  const copy = buyerAddressNoticeCopy(check.result, check.supplierName);
  if (copy === null) {
    return null;
  }
  return (
    <section
      aria-label={`Endereço de compra de ${storeName}`}
      className={cn(
        "mt-4 space-y-3 rounded-2xl p-4 ring-1 ring-inset sm:ml-20",
        NOTICE_TONES[copy.tone],
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TonePill tone={copy.tone} label={copy.label} />
        <span className="text-footnote text-muted-foreground" suppressHydrationWarning>
          Última conferência: {formatSmartDate(check.checkedAt)}
        </span>
      </div>
      {copy.paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-sm leading-relaxed">
          {paragraph}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          disabled={recheck.isPending}
          onClick={() => recheck.mutate(store.id)}
        >
          <ArrowClockwiseIcon weight="bold" aria-hidden="true" />
          {recheck.isPending ? "Conferindo..." : "Já arrumei, conferir de novo"}
        </Button>
        <Link
          to="/suporte"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Está errado? Fale com o suporte
        </Link>
      </div>
    </section>
  );
}
