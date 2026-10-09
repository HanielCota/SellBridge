import { cn } from "cn";

const wholeNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Large figure with the currency raised beside it, like "R$ 9.444". */
export function MoneyFigure({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-start gap-1 font-semibold tracking-[-0.03em]", className)}
    >
      <span className="mt-[0.2em] text-[0.38em] font-medium tracking-normal text-muted-foreground">
        R$
      </span>
      {wholeNumber.format(Math.round(cents / 100))}
    </span>
  );
}

export function CountFigure({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("font-semibold tracking-[-0.03em]", className)}>
      {wholeNumber.format(value)}
    </span>
  );
}

/** Circular progress (0–1) with a short label in the middle. */
export function ProgressRing({ value, label }: { value: number; label: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 56 56" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--muted)" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <span className="text-[11px] font-semibold tabular-nums">{label}</span>
    </span>
  );
}

interface MeterProps {
  label: string;
  current: number;
  previous: number;
  format: (value: number) => string;
}

/** Thin bar: the fill is this period, the marker is where the previous period ended. */
export function ComparisonMeter({ label, current, previous, format }: MeterProps) {
  const scale = Math.max(current, previous, 1) * 1.15;
  const fill = (current / scale) * 100;
  const marker = (previous / scale) * 100;
  return (
    <div className="w-full min-w-40 space-y-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="relative h-2 rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand" style={{ width: `${fill}%` }} />
        <span
          aria-hidden="true"
          className="absolute -top-2.5 size-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-foreground/70"
          style={{ left: `${marker}%` }}
        />
      </div>
      <p className="flex justify-between text-xs tabular-nums">
        <span className="font-medium">{format(current)}</span>
        <span className="text-muted-foreground">antes {format(previous)}</span>
      </p>
    </div>
  );
}
