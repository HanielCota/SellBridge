import { isThinMargin } from "@/features/listings/profit";
import { cn } from "@/lib/utils";

/**
 * Where a sale price goes, in the financial page's colors, so every screen that splits a price
 * tells the same story: supplier cost, marketplace fee and what is left (mint, or red at a loss).
 */
export const PROFIT_SPLIT_COLORS = {
  cost: "bg-finance-cost",
  fee: "bg-finance-fee",
  profit: "bg-brand",
  loss: "bg-destructive",
} as const;

/** Text tone of a profit figure: red at a loss, amber when the margin is thin, mint otherwise. */
export function profitTone(profitCents: number, marginPercent: number): string {
  if (profitCents < 0) {
    return "text-destructive";
  }
  if (isThinMargin(marginPercent)) {
    return "text-amber-700 dark:text-amber-500";
  }
  return "text-brand-text";
}

function share(part: number, whole: number): string {
  return `${Math.max(0, (part / whole) * 100)}%`;
}

/** Cost, fee and profit as slices of the price; a loss leaves no profit slice. */
export function ProfitSplitBar({
  costCents,
  feeCents,
  profitCents,
  className,
}: {
  costCents: number;
  feeCents: number;
  profitCents: number;
  className?: string;
}) {
  const whole = costCents + feeCents + Math.max(0, profitCents);
  const slice = "transition-[width] duration-500 ease-out motion-reduce:transition-none";
  return (
    <div
      className={cn("flex h-2.5 gap-0.5 overflow-hidden rounded-full", className)}
      aria-hidden="true"
    >
      <span
        className={cn(PROFIT_SPLIT_COLORS.cost, slice)}
        style={{ width: share(costCents, whole) }}
      />
      <span
        className={cn(PROFIT_SPLIT_COLORS.fee, slice)}
        style={{ width: share(feeCents, whole) }}
      />
      <span
        className={cn(PROFIT_SPLIT_COLORS.profit, slice)}
        style={{ width: share(profitCents, whole) }}
      />
    </div>
  );
}

/** One line of the split: the slice's swatch, its name and its amount. */
export function ProfitSplitLine({
  swatch,
  label,
  value,
  valueClassName,
}: {
  swatch: string;
  label: string;
  value: string;
  valueClassName?: string | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 shrink-0 rounded-[3px]", swatch)} aria-hidden="true" />
      <dt className="flex-1">{label}</dt>
      <dd className={cn("text-muted-foreground tabular-nums", valueClassName)}>{value}</dd>
    </div>
  );
}
