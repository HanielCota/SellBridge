import type { ReactNode } from "react";
import { PENDING_HATCH_CLASS } from "@/components/reports/pending-cost";
import { cn } from "@/lib/utils";

/*
 * The card a chart shows on hover: the date, then one row per series with the same swatch as
 * the mark it describes. Shared by every chart so they all read alike.
 */

export interface TooltipProps<Payload> {
  active?: boolean;
  payload?: { payload?: Payload }[];
}

export type SwatchVariant = "solid" | "faded" | "dashed" | "hatched";

/** Same color as the mark it describes, so the card reads like a legend; dashed for the past. */
function Swatch({ color, variant = "solid" }: { color: string; variant?: SwatchVariant }) {
  if (variant === "hatched") {
    return <span aria-hidden="true" className={cn("size-2.5 rounded-sm", PENDING_HATCH_CLASS)} />;
  }
  if (variant === "dashed") {
    return (
      <span
        aria-hidden="true"
        className="h-0 w-2.5 border-t-2 border-dashed"
        style={{ borderColor: color }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 rounded-full", variant === "faded" && "opacity-40")}
      style={{ backgroundColor: color }}
    />
  );
}

export function TooltipRow({
  color,
  label,
  value,
  variant = "solid",
  strong = false,
}: {
  color: string;
  label: string;
  value: string;
  variant?: SwatchVariant;
  strong?: boolean;
}) {
  return (
    <>
      <Swatch color={color} variant={variant} />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong ? "font-semibold" : "font-medium")}>
        {value}
      </dd>
    </>
  );
}

export function TooltipCard({
  title,
  children,
  footnote,
}: {
  title: string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <div className="min-w-52 rounded-xl border border-border bg-popover px-3.5 py-3 text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">{title}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-sm">
        {children}
      </dl>
      {footnote ? (
        <p className="mt-2.5 border-t border-border pt-2 text-xs text-muted-foreground">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
