import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatPercentChange } from "@/features/reports/dashboard-insights";

const wholeNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * Large figure with the currency raised beside it, like "R$ 9.444". With `withCents` the
 * cents trail in a quieter size ("R$ 3.776,98"), for screens where the exact amount matters.
 */
export function MoneyFigure({
  cents,
  withCents = false,
  className,
}: {
  cents: number;
  withCents?: boolean;
  className?: string;
}) {
  const sign = cents < 0 ? "−" : "";
  const absolute = Math.abs(cents);
  const whole = withCents ? Math.trunc(absolute / 100) : Math.round(absolute / 100);
  return (
    <span className={cn("inline-flex items-start gap-1 font-semibold tracking-tight", className)}>
      <span className="mt-[0.2em] text-[0.38em] font-medium tracking-normal text-muted-foreground">
        R$
      </span>
      <span>
        {sign}
        {wholeNumber.format(whole)}
        {withCents ? (
          <span className="text-[0.5em] tracking-normal text-muted-foreground">
            ,{String(absolute % 100).padStart(2, "0")}
          </span>
        ) : null}
      </span>
    </span>
  );
}

interface MeterProps {
  label: string;
  current: number;
  previous: number;
  /** Names each row by its dates, e.g. "1–30 set." against "2–31 ago.". */
  currentLabel: string;
  previousLabel: string;
  format: (value: number) => string;
}

/**
 * Two rows on one scale (this period in brand, the previous one muted), so the gap reads at
 * a glance and every number sits next to its own bar.
 */
export function ComparisonMeter({
  label,
  current,
  previous,
  currentLabel,
  previousLabel,
  format,
}: MeterProps) {
  const scale = Math.max(current, previous, 1);
  const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  return (
    <div className="w-full min-w-56 space-y-3">
      <div className="flex h-6 items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {change !== null && change !== 0 ? (
          <Badge variant={change > 0 ? "default" : "secondary"} className="tabular-nums">
            {change > 0 ? (
              <TrendUpIcon data-icon="inline-start" aria-hidden="true" />
            ) : (
              <TrendDownIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {formatPercentChange(change)}
          </Badge>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 text-xs">
        <MeterRow
          term={currentLabel}
          value={format(current)}
          ratio={current / scale}
          barClass="bg-brand"
        />
        <MeterRow
          term={previousLabel}
          value={format(previous)}
          ratio={previous / scale}
          barClass="bg-foreground/25"
          muted
        />
      </dl>
    </div>
  );
}

function MeterRow({
  term,
  value,
  ratio,
  barClass,
  muted = false,
}: {
  term: string;
  value: string;
  ratio: number;
  barClass: string;
  muted?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <span aria-hidden="true" className="h-1.5 rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", barClass)}
          style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%` }}
        />
      </span>
      {/* Fixed width so the bars of side-by-side meters line up whatever the value's length. */}
      <dd
        className={cn(
          "min-w-[4.5rem] text-right font-medium tabular-nums",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </dd>
    </>
  );
}
