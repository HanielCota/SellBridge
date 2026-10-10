import { cn } from "@/lib/utils";

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
