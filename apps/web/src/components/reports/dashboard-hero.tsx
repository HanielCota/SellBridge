import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatPercentChange, trendOf } from "@/features/reports/dashboard-insights";
import { cn } from "@/lib/utils";
import { MoneyFigure } from "./figures";

/**
 * Page title with what the page shows under it and the period controls beside it: the
 * filters change everything below, so they sit with the title rather than further down.
 */
export function DashboardHeader({
  caption,
  filters,
}: {
  caption?: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-1.5">
        <h1 className="text-[34px] leading-none font-semibold tracking-tight sm:text-[40px]">
          Painel de vendas
        </h1>
        {caption ? <p className="text-sm text-muted-foreground">{caption}</p> : null}
      </div>
      {filters}
    </header>
  );
}

interface ProfitFigures {
  profitCents: number;
  revenueCents: number;
}

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

function ProfitTrend({ current, previous }: { current: number; previous: number }) {
  const trend = trendOf(current, previous);
  if (trend === null || trend.direction === "flat") {
    return (
      <span className="text-sm text-muted-foreground">
        {trend === null ? "Sem lucro no período anterior" : "Igual ao período anterior"}
      </span>
    );
  }
  const up = trend.direction === "up";
  const label = trend.isOffScale
    ? "mais de 10×"
    : formatPercentChange(up ? trend.percent : -trend.percent);
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <Badge variant={up ? "default" : "destructive"} className="tabular-nums">
        {up ? (
          <TrendUpIcon data-icon="inline-start" aria-hidden="true" />
        ) : (
          <TrendDownIcon data-icon="inline-start" aria-hidden="true" />
        )}
        {label}
      </Badge>
      vs. período anterior
    </span>
  );
}

/**
 * The period's headline: profit with how it moved and the margin on the left, and the
 * plain-language reading of why on the right. Revenue and orders live in the tiles below.
 */
export function ProfitSpotlight({
  current,
  previous,
  summary,
}: {
  current: ProfitFigures;
  previous: ProfitFigures;
  summary: ReactNode;
}) {
  const isLoss = current.profitCents < 0;
  const margin = current.revenueCents > 0 ? current.profitCents / current.revenueCents : null;
  return (
    <section
      aria-label="Resumo do período"
      className="surface-card grid gap-6 rounded-3xl bg-card p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10 lg:p-8"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {isLoss ? "Prejuízo no período" : "Lucro no período"}
          <span className="sr-only">: {formatCents(current.profitCents)}</span>
        </p>
        <MoneyFigure
          cents={current.profitCents}
          className={cn("text-[52px] leading-none", isLoss && "text-destructive")}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ProfitTrend current={current.profitCents} previous={previous.profitCents} />
          {margin === null ? null : (
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {percent.format(margin)}
              </span>{" "}
              de margem
            </span>
          )}
        </div>
      </div>
      {/* Divider only side by side; stacked, the gap already separates the two halves. */}
      <div className="flex items-center lg:border-l lg:border-border/60 lg:pl-10">{summary}</div>
    </section>
  );
}
