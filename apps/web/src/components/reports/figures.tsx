import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from "@phosphor-icons/react";
import { formatPercentChange, trendOf } from "@/features/reports/dashboard-insights";
import { cn } from "@/lib/utils";

const wholeNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * What a money figure shows. The sign follows the shown amount: −R$ 0,40 keeps it, but
 * −40 centavos shown in whole reais is "R$ 0", never "−R$ 0".
 */
export function moneyFigureParts(cents: number, withCents: boolean) {
  const absolute = Math.abs(cents);
  const whole = withCents ? Math.trunc(absolute / 100) : Math.round(absolute / 100);
  const shownZero = withCents ? absolute === 0 : whole === 0;
  return { sign: cents < 0 && !shownZero ? "−" : "", whole, absolute };
}

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
  const { sign, whole, absolute } = moneyFigureParts(cents, withCents);
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

const SPOKEN_DIRECTION = { up: "alta de", down: "queda de", flat: "estável," } as const;

/**
 * Change against the previous period as a short badge: arrow, percent and, optionally, what it
 * compares to. Rising reads in the brand color and falling in red, always with the arrow, so the
 * direction never depends on color alone.
 */
export function TrendBadge({
  current,
  previous,
  suffix,
  className,
}: {
  current: number | null;
  previous: number | null;
  suffix?: string;
  className?: string;
}) {
  const trend = trendOf(current, previous);
  if (trend === null) {
    return null;
  }
  // The arrow already says the direction, so the number goes without a sign.
  const label = trend.isOffScale
    ? "mais de 10×"
    : formatPercentChange(trend.percent).replace("+", "");
  return (
    <DeltaBadge direction={trend.direction} label={label} suffix={suffix} className={className} />
  );
}

const DIRECTION_ICONS = { up: ArrowUpIcon, down: ArrowDownIcon, flat: ArrowRightIcon } as const;

/** Arrow plus an unsigned amount ("↑ 20%", "↓ 3 p.p."), colored by direction. */
export function DeltaBadge({
  direction,
  label,
  suffix,
  className,
}: {
  direction: "up" | "down" | "flat";
  label: string;
  suffix?: string | undefined;
  className?: string | undefined;
}) {
  const Icon = DIRECTION_ICONS[direction];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        direction === "up" && "text-brand-text",
        direction === "down" && "text-destructive",
        direction === "flat" && "text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3" weight="bold" aria-hidden="true" />
      <span className="sr-only">{SPOKEN_DIRECTION[direction]}</span>
      {label}
      {suffix ? <span className="font-normal text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}

/** Room inside the sparkline's box for the end dot (radius 3 plus its ring), so nothing is cut. */
const INSET = 5;

/** Tiny trend line for a tile: shape only, no axes; the last value is marked. */
export function Sparkline({
  values,
  className,
}: {
  values: readonly number[];
  className?: string;
}) {
  if (values.length < 2) {
    return null;
  }
  const width = 96;
  const height = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const coordinates = values.map((value, index) => ({
    left: (index / (values.length - 1)) * (width - INSET * 2) + INSET,
    top: height - INSET - ((value - min) / span) * (height - INSET * 2),
  }));
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.left},${point.top}`)
    .join(" ");
  const last = coordinates.at(-1);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-8 w-24 shrink-0 text-chart-brand", className)}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last ? (
        <circle
          cx={last.left}
          cy={last.top}
          r={3}
          fill="currentColor"
          stroke="var(--card)"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}
