import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { formatPercentChange } from "@/features/reports/dashboard-insights";
import { MoneyFigure } from "./figures";

interface Comparison {
  /** The previous period's value, already formatted ("43%", "R$ 97,90"). */
  previous: string;
  /** What happened, in words: "Caiu", "Subiu 48%", "Igual". */
  outcome: string;
  /** Good news for the seller (fewer cancellations is); null when nothing changed. */
  good: boolean | null;
}

interface TileProps {
  label: string;
  figure: ReactNode;
  caption: ReactNode;
  comparison: Comparison | null;
}

/**
 * One reading per tile: the number, one plain line on what it means and, set apart in the
 * footer, the previous period in neutral text. The whole tile opens the financial report.
 */
function KpiTile({ label, figure, caption, comparison }: TileProps) {
  return (
    <Link
      to="/financeiro"
      className="group surface-interactive flex flex-col gap-5 rounded-3xl bg-card p-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="-my-1 flex h-8 items-center justify-between gap-3">
        <p className="text-subhead font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          {label}
        </p>
        <span className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
          <ArrowUpRightIcon className="size-3.5" weight="bold" aria-hidden="true" />
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex h-10 items-end text-[34px] leading-none">{figure}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">{caption}</p>
      </div>
      <p className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground tabular-nums">
        {comparison ? (
          <>
            <span>
              Era <span className="text-foreground">{comparison.previous}</span> no período anterior
            </span>
            <span
              className={cn(
                "shrink-0 font-medium",
                comparison.good === true && "text-brand-text",
                comparison.good === false && "text-foreground",
              )}
            >
              {comparison.outcome}
            </span>
          </>
        ) : (
          <span>Sem dados do período anterior</span>
        )}
      </p>
    </Link>
  );
}

function PercentFigure({ value }: { value: number }) {
  return (
    <span className="inline-flex items-start gap-1 font-semibold tracking-tight">
      {Math.round(value * 100)}
      <span className="mt-[0.2em] text-[0.38em] font-medium tracking-normal text-muted-foreground">
        %
      </span>
    </span>
  );
}

const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

/**
 * Two rates (0–1) shown side by side. The change is only named ("Caiu"), never as a difference
 * of percentages: "−6 p.p." reads as jargon and "−14%" of a margin reads as a wrong number.
 */
function compareRates(
  current: number | null,
  previous: number | null,
  upIsGood: boolean,
): Comparison | null {
  if (current === null || previous === null) {
    return null;
  }
  const points = Math.round(current * 100) - Math.round(previous * 100);
  if (points === 0) {
    return { previous: percent.format(previous), outcome: "Igual", good: null };
  }
  return {
    previous: percent.format(previous),
    outcome: points > 0 ? "Subiu" : "Caiu",
    good: points > 0 === upIsGood,
  };
}

/** Two amounts in cents; the change is a plain percentage of the previous amount. */
function compareMoney(current: number | null, previous: number | null): Comparison | null {
  if (current === null || previous === null || previous <= 0) {
    return null;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) {
    return { previous: formatCents(previous), outcome: "Igual", good: null };
  }
  const amount = formatPercentChange(change).replace(/^[+−]/, "");
  return {
    previous: formatCents(previous),
    outcome: `${change > 0 ? "Subiu" : "Caiu"} ${amount}`,
    good: change > 0,
  };
}

interface Figures {
  revenueCents: number;
  profitCents: number;
  orders: number;
  cancelledOrders: number;
  averageTicketCents: number | null;
}

function marginOf(figures: Figures): number | null {
  return figures.revenueCents > 0 ? figures.profitCents / figures.revenueCents : null;
}

function cancellationRateOf(figures: Figures): number | null {
  const total = figures.orders + figures.cancelledOrders;
  return total > 0 ? figures.cancelledOrders / total : null;
}

const count = new Intl.NumberFormat("pt-BR");

/**
 * Revenue, orders and profit already sit in the hero; these tiles answer what they don't:
 * how much of each sale is left, how much a sale is worth and how many sales were lost.
 */
export function KpiTiles({ summary, previous }: { summary: Figures; previous: Figures }) {
  const margin = marginOf(summary);
  const cancellationRate = cancellationRateOf(summary);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <KpiTile
        label="Margem de lucro"
        figure={margin === null ? "—" : <PercentFigure value={margin} />}
        caption={<MarginCaption margin={margin} />}
        comparison={compareRates(margin, marginOf(previous), true)}
      />
      <KpiTile
        label="Ticket médio"
        figure={
          summary.averageTicketCents === null ? (
            "—"
          ) : (
            <MoneyFigure cents={summary.averageTicketCents} />
          )
        }
        caption="Valor médio de cada venda concluída."
        comparison={compareMoney(summary.averageTicketCents, previous.averageTicketCents)}
      />
      <KpiTile
        label="Cancelamentos"
        figure={cancellationRate === null ? "—" : <PercentFigure value={cancellationRate} />}
        comparison={compareRates(cancellationRate, cancellationRateOf(previous), false)}
        caption={
          cancellationRate === null ? (
            "Nenhum pedido no período."
          ) : (
            <>
              <Strong>{count.format(summary.cancelledOrders)}</Strong> de{" "}
              {count.format(summary.orders + summary.cancelledOrders)} pedidos foram cancelados.
            </>
          )
        }
      />
    </div>
  );
}

/** Profit margin as money: what is left (or lost) of every R$ 100 sold. */
function MarginCaption({ margin }: { margin: number | null }) {
  if (margin === null) {
    return <>Sem vendas no período.</>;
  }
  const perHundred = formatCents(Math.round(Math.abs(margin) * 10_000));
  return margin < 0 ? (
    <>
      Prejuízo de <Strong>{perHundred}</Strong> a cada R$ 100 vendidos.
    </>
  ) : (
    <>
      Sobram <Strong>{perHundred}</Strong> de cada R$ 100 vendidos.
    </>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground tabular-nums">{children}</span>;
}
