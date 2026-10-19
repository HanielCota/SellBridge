import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { LISTING_STATUS_LABELS } from "@sellbridge/shared/schemas";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ProductStockLine } from "@/components/catalog/product-stock-line";
import { ProductVisual } from "@/components/catalog/product-visual";
import { SoldOutFooter, SoldOutRibbon } from "@/components/catalog/sold-out";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { listingHealth, listingRunState } from "@/features/listings/listing-health";
import { estimateProfit, isThinMargin, wholeMarginPercent } from "@/features/listings/profit";
import { useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import {
  useBulkListingActions,
  useResendDescription,
} from "@/features/listings/use-listing-actions";
import { ToneStatus } from "@/components/data/tone-status";
import { displayStoreName } from "@/features/stores/store-name";
import { cn } from "@/lib/utils";
import { EditPriceDialog } from "./edit-price-dialog";
import { ListingMenu } from "./listing-actions";
import { RUN_STATE_DOT } from "./run-state-style";
import { SalesSparkline } from "./sales-sparkline";
import { CONTROL_HINTS, TERM_HINTS } from "@/components/icons/action-icons";
import { Hint, HintedText } from "@/components/ui/hint";

/** Every store and its status, for the tooltip of the status line. */
function storesSummary(row: ListingOverviewRow): string {
  return row.stores
    .map((store) => `${displayStoreName(store.storeName)}: ${LISTING_STATUS_LABELS[store.status]}`)
    .join("\n");
}

/** Same lines as the catalog card: the price as the headline, cost and margin beneath. */
function PriceLines({ row, offSale }: { row: ListingOverviewRow; offSale: boolean }) {
  const schedule = useFeeSchedule();
  const margin = estimateProfit(row.priceCents, row.costCents, schedule)?.marginPercent;
  return (
    <div className="min-w-0 space-y-0.5 tabular-nums">
      <p
        className={cn(
          "text-lg leading-tight font-semibold tracking-tight",
          offSale && "text-muted-foreground line-through decoration-destructive",
        )}
      >
        {formatCents(row.priceCents)}
      </p>
      <p className="text-sm text-muted-foreground">
        custo {formatCents(row.costCents)}
        {margin === undefined ? null : (
          <>
            {" · "}
            <Hint label="Estimativa com o custo do fornecedor e a taxa média do marketplace">
              <span className={cn(isThinMargin(margin) && "text-amber-700 dark:text-amber-500")}>
                margem {wholeMarginPercent(margin)}%
              </span>
            </Hint>
          </>
        )}
      </p>
    </div>
  );
}

/** What publishing adds to the catalog card: how the product sold in the last 30 days. */
function SalesTrend({ row }: { row: ListingOverviewRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <HintedText
        label={TERM_HINTS.unitsSold}
        className="text-xs text-muted-foreground tabular-nums"
      >
        {row.unitsSold.toLocaleString("pt-BR")} {row.unitsSold === 1 ? "venda" : "vendas"} em 30
        dias
      </HintedText>
      <SalesSparkline dailySales={row.dailySales} muted={row.stock <= 0} />
    </div>
  );
}

function RetryButton({ listingId }: { listingId: string }) {
  const { retry } = useBulkListingActions();
  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={retry.isPending}
      onClick={() => retry.mutate([listingId])}
    >
      <ArrowClockwiseIcon
        weight="bold"
        className={cn(retry.isPending && "animate-spin motion-reduce:animate-none")}
        aria-hidden="true"
      />
      Reprocessar
    </Button>
  );
}

/** The first live store whose description did not go through, or null when all have one. */
function missingDescription(row: ListingOverviewRow): string | null {
  const store = row.stores.find(
    (candidate) => candidate.descriptionError !== null && candidate.status !== "error",
  );
  return store?.descriptionError ?? null;
}

function ResendDescriptionButton({ listingId }: { listingId: string }) {
  const resend = useResendDescription();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label="Reenviar descrição"
      className="max-sm:w-full"
      disabled={resend.isPending}
      onClick={() => resend.mutate(listingId)}
    >
      <ArrowClockwiseIcon
        weight="bold"
        className={cn(resend.isPending && "animate-spin motion-reduce:animate-none")}
        aria-hidden="true"
      />
      {/* Two cards side by side on a phone leave no room for the long label. */}
      <span className="sm:hidden">Reenviar</span>
      <span className="max-sm:hidden">Reenviar descrição</span>
    </Button>
  );
}

/**
 * The listing is live, but the marketplace did not take its description: an attention line (the
 * listing still sells), the marketplace's reason and the resend (13.b).
 */
function MissingDescription({ row }: { row: ListingOverviewRow }) {
  const reason = missingDescription(row);
  if (reason === null) {
    return null;
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <ToneStatus tone="warning" label="Descrição não enviada" />
        <ResendDescriptionButton listingId={row.listingId} />
      </div>
      <p className="text-xs wrap-anywhere text-muted-foreground">{reason}</p>
    </div>
  );
}

/** The catalog's footer, with the publishing status where the catalog has "Publicar". */
function StatusFooter({ row }: { row: ListingOverviewRow }) {
  const health = listingHealth(row);
  const state = listingRunState(row);
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p
          className={cn(
            "flex min-w-0 items-center gap-2 text-xs",
            state === "off" ? "text-destructive" : "text-muted-foreground",
          )}
          title={storesSummary(row)}
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full", RUN_STATE_DOT[state])}
          />
          <span className="truncate">{health.label}</span>
        </p>
        {health.tone === "error" ? <RetryButton listingId={row.listingId} /> : null}
        {/* Out of stock is already the status line; the badge would only repeat it. */}
        {health.tone !== "error" && row.stock > 0 ? <ProductStockLine stock={row.stock} /> : null}
      </div>
      {health.reason ? <p className="text-xs text-destructive">{health.reason}</p> : null}
      <MissingDescription row={row} />
    </div>
  );
}

/** Supplier, title, prices and sales, with the store status unless the sold-out footer replaces it. */
function ListingCardBody({
  row,
  soldOut,
  showsStatus,
}: {
  row: ListingOverviewRow;
  soldOut: boolean;
  showsStatus: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="space-y-1">
        <p className="truncate text-xs text-muted-foreground">{row.supplierName}</p>
        <h2
          className={cn(
            "line-clamp-2 text-sm font-medium wrap-anywhere",
            soldOut && "text-muted-foreground",
          )}
        >
          {row.title}
        </h2>
      </div>
      <div className="mt-auto space-y-3">
        <PriceLines row={row} offSale={soldOut} />
        <SalesTrend row={row} />
      </div>
      {showsStatus ? <StatusFooter row={row} /> : null}
    </div>
  );
}

/**
 * The catalog's product card, reused for a product already published: same photo, title and
 * price, plus its recent sales, where it is live and the actions that only exist after publishing.
 */
export function ListingCard({
  row,
  selected,
  onSelectedChange,
}: {
  row: ListingOverviewRow;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const openPriceEditor = () => setIsEditingPrice(true);
  // Out of the supplier's stock or catalog: either way nothing sells, only the first is "Esgotado".
  const outOfStock = row.stock <= 0;
  const soldOut = outOfStock || row.unavailable !== null;
  // A store error outranks the stock: it keeps its own line and the retry button.
  const health = listingHealth(row);
  const showsSoldOutFooter = health.tone === "attention";

  /** The whole card toggles selection; its own controls (checkbox, menu, retry) keep their behavior. */
  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (!(event.target instanceof Element)) return;
    // Clicks in the portaled menu and price dialog bubble here through React; they are not the card.
    if (!event.currentTarget.contains(event.target)) return;
    if (event.target.closest("a, button, input, label, [role='menuitem']")) return;
    onSelectedChange(!selected);
  }

  return (
    // Pointer shortcut only; the checkbox stays the keyboard and screen-reader control.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      aria-label={row.title}
      onClick={handleCardClick}
      className={cn(
        "group surface-card flex w-full cursor-pointer flex-col overflow-hidden rounded-3xl bg-card select-none",
        selected && "ring-2 ring-brand",
      )}
    >
      <ProductVisual
        imageUrl={row.imageUrl}
        title={row.title}
        categoryName={row.categoryName}
        soldOut={soldOut}
        className="aspect-[16/10]"
      />
      {outOfStock ? <SoldOutRibbon placement="clearOfMenu" /> : null}
      <Hint label={CONTROL_HINTS.selectListings} openOnTap={false}>
        <Checkbox
          aria-label={`Selecionar ${row.title}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          className="absolute top-3 left-3 size-5 bg-background"
        />
      </Hint>
      <ListingMenu row={row} onEditPrice={openPriceEditor} />
      <ListingCardBody row={row} soldOut={soldOut} showsStatus={!showsSoldOutFooter} />
      {showsSoldOutFooter ? <SoldOutFooter label={health.label} detail={health.reason} /> : null}
      <EditPriceDialog open={isEditingPrice} onOpenChange={setIsEditingPrice} listing={row} />
    </article>
  );
}
