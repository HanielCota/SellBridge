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
      <div className="space-y-2">
        <h1 className="text-[44px] leading-none font-semibold tracking-tight text-balance sm:text-[56px]">
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

function ProfitBlock({ current, previous }: { current: ProfitFigures; previous: ProfitFigures }) {
  const isLoss = current.profitCents < 0;
  const margin = current.revenueCents > 0 ? current.profitCents / current.revenueCents : null;
  return (
    <div className="space-y-3">
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
  );
}

/**
 * The top of the dashboard as one two-column grid, so everything lines up: the title over the
 * reading on the left; the filters over the profit on the right, starting at the same x. In the
 * second row the reading and the profit start at the same height. Stacked on phones.
 */
export function DashboardIntro({
  caption,
  filters,
  current,
  previous,
  summary,
}: {
  caption: ReactNode;
  filters: ReactNode;
  current: ProfitFigures;
  previous: ProfitFigures;
  summary: ReactNode;
}) {
  return (
    <section
      aria-label="Resumo do período"
      className="grid gap-x-16 gap-y-8 pb-2 lg:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="space-y-2">
        <h1 className="text-[44px] leading-none font-semibold tracking-tight text-balance sm:text-[56px]">
          Painel de vendas
        </h1>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      <div className="lg:self-end">{filters}</div>
      {summary}
      <ProfitBlock current={current} previous={previous} />
    </section>
  );
}
