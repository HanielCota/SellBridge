import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import type { FeeSchedule } from "@sellbridge/shared/fee-model";
import { formatCents, parseBrlToCents } from "@sellbridge/shared/money";
import { LISTING_MAX_PRICE_CENTS } from "@sellbridge/shared/schemas";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ListingRunState } from "@/features/listings/listing-health";
import { totalFeeCents } from "@/components/listings/profit-split";
import {
  estimateProfit,
  feePercentLabel,
  isThinMargin,
  minimumPrice,
  priceForMargin,
  type ProfitEstimate,
  wholeMarginPercent,
} from "@/features/listings/profit";
import { useFeeSchedule } from "@/features/reports/fee-schedule.queries";
import { useUpdatePrice } from "@/features/listings/use-listing-actions";
import { formatCentsForField, maskCurrencyInput, readPastedCurrency } from "@/lib/currency-mask";
import { cn } from "@/lib/utils";
import { RUN_STATE_DOT, RUN_STATE_TEXT, RUN_STATE_TINT } from "./run-state-style";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

type PricedListing = Pick<
  ListingOverviewRow,
  "listingId" | "title" | "priceCents" | "costCents" | "stores"
>;

interface EditPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: PricedListing;
}

/** Margins offered as one-tap shortcuts; each shows the price it leads to. */
const MARGIN_SHORTCUTS = [10, 25, 40, 55] as const;

/** Same palette as the listing's state: green healthy, amber low, red at a loss. */
type MarginTone = Extract<ListingRunState, "live" | "paused" | "off">;

const MARGIN_NAMES: Record<MarginTone, string> = {
  live: "saudável",
  paused: "baixa",
  off: "prejuízo",
};

const TILE_ACTIVE: Record<MarginTone, string> = {
  live: "bg-emerald-500/12 ring-emerald-500/55",
  paused: "bg-amber-500/14 ring-amber-500/55",
  off: "bg-destructive/12 ring-destructive/55",
};

/** The server's floor, said before saving: the lowest price that pays after every fee. */
function belowFloorProblem(
  priceCents: number,
  costCents: number,
  schedule: FeeSchedule,
): string | null {
  const floorCents = minimumPrice(costCents, schedule);
  if (floorCents === null) {
    return "As taxas configuradas não deixam lucro para este produto";
  }
  if (priceCents >= floorCents) {
    return null;
  }
  if (schedule.minimumMarginPercent === 0) {
    return `Abaixo de ${formatCents(floorCents)} você tem prejuízo depois das taxas`;
  }
  return `Abaixo de ${formatCents(floorCents)} a margem fica menor que ${schedule.minimumMarginPercent}%`;
}

function priceProblem(
  priceCents: number | null,
  costCents: number,
  schedule: FeeSchedule,
): string | null {
  if (priceCents === null || priceCents <= 0) {
    return "Informe um preço válido";
  }
  if (priceCents > LISTING_MAX_PRICE_CENTS) {
    return `O preço de venda pode ser de até ${formatCents(LISTING_MAX_PRICE_CENTS)}`;
  }
  if (priceCents <= costCents) {
    return `O preço precisa ser maior que o custo (${formatCents(costCents)})`;
  }
  return belowFloorProblem(priceCents, costCents, schedule);
}

function toneOfMargin(marginPercent: number): MarginTone {
  if (marginPercent < 0) {
    return "off";
  }
  if (isThinMargin(marginPercent)) {
    return "paused";
  }
  return "live";
}

function toneOf(estimate: ProfitEstimate | null, problem: string | null): MarginTone {
  if (problem || !estimate) {
    return "off";
  }
  return toneOfMargin(estimate.marginPercent);
}

/** Shortcut prices end in ,90 like shelf prices, rounding up so the margin is never below. */
function shelfPrice(cents: number): number {
  return Math.ceil((cents - 90) / 100) * 100 + 90;
}

function MarginChip({ tone, estimate }: { tone: MarginTone; estimate: ProfitEstimate | null }) {
  return (
    <HintedText
      label={TERM_HINTS.healthyMargin}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap transition-colors duration-300",
        RUN_STATE_TEXT[tone],
        RUN_STATE_TINT[tone],
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", RUN_STATE_DOT[tone])} />
      {estimate ? `${wholeMarginPercent(estimate.marginPercent)}% · ` : null}
      {MARGIN_NAMES[tone]}
    </HintedText>
  );
}

/** The price in large type, with the margin it gives sitting inside the same field. */
function PriceField({
  value,
  problem,
  tone,
  estimate,
  onChange,
}: {
  value: string;
  problem: string | null;
  tone: MarginTone;
  estimate: ProfitEstimate | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor="listing-price" className="text-sm text-muted-foreground">
        Preço de venda
      </label>
      <div
        className={cn(
          "flex h-16 items-center gap-2 rounded-2xl bg-background px-4 ring-1 ring-foreground/10 transition-shadow duration-200 focus-within:ring-foreground/25",
          problem && "ring-destructive/50 focus-within:ring-destructive/70",
        )}
      >
        <span className="text-lg font-semibold text-muted-foreground">R$</span>
        <input
          id="listing-price"
          aria-label="Preço de venda (R$)"
          aria-invalid={problem !== null}
          aria-describedby="listing-price-hint"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onPaste={(event) => {
            // A pasted amount replaces the field whole; it is not typed digit by digit.
            event.preventDefault();
            const pasted = readPastedCurrency(event.clipboardData.getData("text"));
            if (pasted !== null) onChange(pasted);
          }}
          onChange={(event) => {
            const field = event.currentTarget;
            onChange(maskCurrencyInput(field.value));
            // The mask rewrites the whole value; keep typing at the end, like a card machine.
            requestAnimationFrame(() =>
              field.setSelectionRange(field.value.length, field.value.length),
            );
          }}
          className="min-w-0 flex-1 bg-transparent text-3xl font-bold tracking-tight tabular-nums outline-none selection:bg-foreground/15"
        />
        <MarginChip tone={tone} estimate={problem ? null : estimate} />
      </div>
      <p
        id="listing-price-hint"
        aria-live="polite"
        className={cn("text-xs", problem ? "text-destructive" : "sr-only")}
      >
        {problem ?? `Margem ${MARGIN_NAMES[tone]}`}
      </p>
    </div>
  );
}

/** Each shortcut carries a line in the color of the band its margin falls in. */
function MarginShortcuts({
  costCents,
  priceCents,
  tone,
  onPick,
}: {
  costCents: number;
  priceCents: number | null;
  tone: MarginTone;
  onPick: (priceCents: number) => void;
}) {
  const schedule = useFeeSchedule();
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Margem</p>
      <div className="grid grid-cols-4 gap-1.5">
        {MARGIN_SHORTCUTS.map((margin) => {
          const exact = priceForMargin(costCents, margin, schedule);
          const price = exact === null ? null : shelfPrice(exact);
          const active = price !== null && price === priceCents;
          return (
            <button
              key={margin}
              type="button"
              aria-pressed={active}
              disabled={price === null || margin < schedule.minimumMarginPercent}
              onClick={() => {
                if (price !== null) {
                  onPick(price);
                }
              }}
              className={cn(
                "relative flex h-16 flex-col items-center justify-center rounded-xl bg-foreground/[0.04] pb-2 tabular-nums transition-[background-color,box-shadow,transform] duration-200 outline-none hover:bg-foreground/[0.07] focus-visible:ring-[3px] focus-visible:ring-foreground/15 active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100",
                active && cn("ring-[1.5px] ring-inset", TILE_ACTIVE[tone]),
              )}
            >
              <span className={cn("text-sm font-bold", active && RUN_STATE_TEXT[tone])}>
                {margin}%
              </span>
              <span className="text-xs text-muted-foreground">
                {price === null ? "—" : formatCents(price)}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-3 bottom-1.5 h-[3px] rounded-full transition-opacity duration-200",
                  RUN_STATE_DOT[toneOfMargin(margin)],
                  active ? "opacity-100" : "opacity-45",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Taxa 14%", or just "Taxas" when SellBridge's fee joins the marketplace's. */
function feesLabel(schedule: FeeSchedule): string {
  if (schedule.platformFeeBasisPoints > 0 || schedule.estimatedShippingCents > 0) {
    return "Taxas";
  }
  return `Taxa ${feePercentLabel(schedule.marketplaceFeeBasisPoints)}`;
}

/** Where the price goes: supplier cost, every fee and the profit, in the margin's color. */
function PriceBreakdown({
  costCents,
  estimate,
  tone,
}: {
  costCents: number;
  estimate: ProfitEstimate | null;
  tone: MarginTone;
}) {
  const schedule = useFeeSchedule();
  const parts = [
    { label: "Custo", value: formatCents(costCents), className: "", hint: undefined },
    {
      label: feesLabel(schedule),
      value: estimate ? formatCents(totalFeeCents(estimate)) : "—",
      className: "",
      hint: TERM_HINTS.marketplaceFee,
    },
    {
      label: "Lucro",
      value: estimate ? formatCents(estimate.profitCents) : "—",
      className: cn("transition-colors duration-300", RUN_STATE_TEXT[tone]),
      hint: undefined,
    },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x divide-border rounded-xl bg-foreground/[0.035] tabular-nums">
      {parts.map((part) => (
        <div key={part.label} className="px-3.5 py-2.5">
          <dt className="text-xs text-muted-foreground">
            {part.hint ? (
              <HintedText label={part.hint} className="hinted-term">
                {part.label}
              </HintedText>
            ) : (
              part.label
            )}
          </dt>
          <dd className={cn("mt-0.5 text-sm font-bold", part.className)}>{part.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function storesLabel(count: number): string {
  return count === 1 ? "Vale para 1 loja" : `Vale para as ${count} lojas`;
}

function EditPriceForm({ listing, onDone }: { listing: PricedListing; onDone: () => void }) {
  const [value, setValue] = useState(formatCentsForField(listing.priceCents));
  const mutation = useUpdatePrice(onDone);
  const schedule = useFeeSchedule();
  const priceCents = parseBrlToCents(value);
  const problem = priceProblem(priceCents, listing.costCents, schedule);
  const estimate = estimateProfit(priceCents, listing.costCents, schedule);
  const tone = toneOf(estimate, problem);
  return (
    <form
      noValidate
      className="min-w-0 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (priceCents === null || problem) {
          return;
        }
        mutation.mutate({ listingId: listing.listingId, priceCents });
      }}
    >
      <PriceField
        value={value}
        problem={problem}
        tone={tone}
        estimate={estimate}
        onChange={setValue}
      />
      <MarginShortcuts
        costCents={listing.costCents}
        priceCents={priceCents}
        tone={tone}
        onPick={(cents) => setValue(formatCentsForField(cents))}
      />
      <PriceBreakdown costCents={listing.costCents} estimate={estimate} tone={tone} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={problem !== null || mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar preço"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** New sale price for every store; the sync job sends it to the marketplaces. */
export function EditPriceDialog({ open, onOpenChange, listing }: EditPriceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Editar preço</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {listing.title} · {storesLabel(listing.stores.length)}
          </DialogDescription>
        </DialogHeader>
        {open ? <EditPriceForm listing={listing} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
