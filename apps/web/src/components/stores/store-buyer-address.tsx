import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import {
  type BuyerAddressNoticeCopy,
  buyerAddressNoticeCopy,
  falseAlarmTicketSearch,
} from "@/features/stores/buyer-address-copy";
import { useRecheckBuyerAddress } from "@/features/stores/use-recheck-buyer-address";
import type { StoreWithActivity } from "./store-list";
import { formatSmartDate } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const NOTICE_TONES = {
  danger: "bg-destructive/[0.06] ring-destructive/25",
  warning: "bg-amber-500/[0.07] ring-amber-500/30",
  muted: "bg-foreground/[0.03] ring-border",
} as const;

/** The address the reseller has to find among the account's, written as Mercado Livre lists it. */
function WrongAddress({ address }: { address: string | null }) {
  if (address === null) {
    return null;
  }
  return (
    <p className="text-sm leading-relaxed">
      <span className="block text-footnote text-muted-foreground">
        Endereço de compra hoje (é o do fornecedor)
      </span>
      <span className="font-medium">{address}</span>
    </p>
  );
}

function FixSteps({ steps }: { steps: readonly string[] }) {
  if (steps.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Como arrumar</p>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-footnote font-semibold ring-1 ring-border"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NoticeActions({
  copy,
  store,
}: {
  copy: BuyerAddressNoticeCopy;
  store: StoreWithActivity;
}) {
  const recheck = useRecheckBuyerAddress();
  if (copy.actionLabel === null) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button
        type="button"
        // A held store has one way out, so it gets the filled button; a warning stays quiet.
        variant={copy.tone === "danger" ? "default" : "outline"}
        className="h-11 sm:h-9"
        disabled={recheck.isPending}
        onClick={() => recheck.mutate(store.id)}
      >
        <ArrowClockwiseIcon weight="bold" aria-hidden="true" />
        {recheck.isPending ? "Conferindo..." : copy.actionLabel}
      </Button>
      {copy.offersFalseAlarm ? (
        <Link
          to="/suporte/novo"
          search={falseAlarmTicketSearch(store.id, store.buyerAddress?.supplierName ?? null)}
          className="py-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Não é o endereço do fornecedor? Peça a liberação
        </Link>
      ) : (
        <Link
          to="/suporte"
          className="py-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Está errado? Fale com o suporte
        </Link>
      )}
    </div>
  );
}

/**
 * Under a Mercado Livre store whose account buys at its supplier's address (or may): what goes
 * wrong, which address to change, the steps on Mercado Livre and the one button to check again.
 */
export function StoreBuyerAddressNotice({
  store,
  storeName,
}: {
  store: StoreWithActivity;
  storeName: string;
}) {
  const check = store.buyerAddress;
  if (store.status !== "connected" || check === null) {
    return null;
  }
  const copy = buyerAddressNoticeCopy(check);
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
      <WrongAddress address={copy.wrongAddress} />
      <FixSteps steps={copy.steps} />
      <NoticeActions copy={copy} store={store} />
    </section>
  );
}
