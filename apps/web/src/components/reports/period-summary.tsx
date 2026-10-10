import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  bestPoint,
  explainRevenue,
  OFF_SCALE_PERCENT,
  trendOf,
} from "@/features/reports/dashboard-insights";
import { formatPointDate, type MetricPoint } from "@/features/reports/dashboard-metrics";

interface Totals {
  revenueCents: number;
  orders: number;
  profitCents: number;
}

interface PeriodSummaryProps {
  current: Totals;
  previous: Totals;
  points: MetricPoint[];
  bucket: "day" | "week";
  className?: string;
}

const wholePercent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Small changes (a few percent) are noise; the sentence only mentions what clearly moved. */
const NOTABLE_PERCENT = 3;

/**
 * Plain-language reading of the period: the profit (how it moved and the margin), whether
 * revenue went up or down and why (more or fewer sales, each worth more or less), and the
 * best day. Revenue and orders as numbers live in the tiles below.
 */
export function PeriodSummary({
  current,
  previous,
  points,
  bucket,
  className,
}: PeriodSummaryProps) {
  const best = points.length > 1 ? bestPoint(points, (point) => point.revenueCents) : null;
  return (
    <p
      className={cn(
        "max-w-md text-base leading-relaxed text-muted-foreground text-pretty",
        className,
      )}
    >
      <ProfitSentence current={current} previous={previous} />
      <Headline current={current} previous={previous} />
      {best ? (
        <>
          {" "}
          {bucket === "week" ? "Sua melhor semana começou em " : "Seu melhor dia foi "}
          <Strong>{withPeriod(formatPointDate(best.date))}</Strong>
        </>
      ) : null}
    </p>
  );
}

function Headline({ current, previous }: { current: Totals; previous: Totals }) {
  const story = explainRevenue(current, previous);
  if (story.kind === "no-baseline") {
    return current.revenueCents > 0 ? (
      <>Suas primeiras vendas chegaram.</>
    ) : (
      <>Nenhuma venda por enquanto.</>
    );
  }
  if (story.kind === "flat") {
    return <>A receita ficou igual à do período anterior.</>;
  }
  const up = story.revenue > 0;
  if (Math.abs(story.revenue) >= OFF_SCALE_PERCENT) {
    // Almost nothing sold before: "subiu 14.133%" and its reasons would be noise.
    return <>A receita foi mais de 10 vezes a do período anterior.</>;
  }
  const why = reason(story.orders, story.ticket);
  return (
    <>
      A receita {up ? "subiu" : "caiu"}{" "}
      <Tone up={up}>{wholePercent.format(Math.abs(story.revenue))}%</Tone>
      {why ? `:${why}` : "."}
    </>
  );
}

/** Direction of a change, or null when it is too small to mention. */
function direction(percent: number | null): "up" | "down" | null {
  if (percent === null || Math.abs(percent) < NOTABLE_PERCENT) {
    return null;
  }
  return percent > 0 ? "up" : "down";
}

/** "22% mais", "12.300% mais". */
function amount(percent: number): string {
  return `${wholePercent.format(Math.abs(percent))}% ${percent > 0 ? "mais" : "menos"}`;
}

/** The two levers in plain words: "Foram 22% mais vendas, mas cada uma valeu 9% menos." */
function reason(orders: number, ticket: number | null): string {
  const count = direction(orders);
  const value = direction(ticket);
  const countText = `${amount(orders)} vendas`;
  const valueText = `valeu ${amount(ticket ?? 0)}`;
  if (count && value) {
    return ` foram ${countText}${count === value ? " e " : ", mas "}cada uma ${valueText}.`;
  }
  if (count) {
    return ` foram ${countText}.`;
  }
  if (value) {
    return ` cada venda ${valueText}.`;
  }
  return "";
}

/** Whole reais read better in a sentence than cents: "R$ 4.303". */
const wholeReais = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const percentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
});

/** "Você lucrou R$ 1.130 no período, 10% a mais que no anterior, com 37% de margem." */
function ProfitSentence({ current, previous }: { current: Totals; previous: Totals }) {
  if (current.revenueCents <= 0 && current.profitCents === 0) {
    return null;
  }
  if (current.profitCents < 0) {
    return (
      <>
        Você teve{" "}
        <span className="font-medium text-destructive">
          prejuízo de {wholeReais.format(-current.profitCents / 100)}
        </span>{" "}
        no período.{" "}
      </>
    );
  }
  const trend = trendOf(current.profitCents, previous.profitCents);
  const margin = current.revenueCents > 0 ? current.profitCents / current.revenueCents : null;
  const moved = trend !== null && trend.direction !== "flat";
  return (
    <>
      Você lucrou <Strong>{wholeReais.format(current.profitCents / 100)}</Strong> no período
      {moved ? (
        <>
          ,{" "}
          {trend.isOffScale ? (
            <>
              <Tone up>mais de 10 vezes</Tone> o do período anterior
            </>
          ) : (
            <>
              <Tone up={trend.direction === "up"}>
                {wholePercent.format(trend.percent)}% a{" "}
                {trend.direction === "up" ? "mais" : "menos"}
              </Tone>{" "}
              que no anterior
            </>
          )}
        </>
      ) : null}
      {margin === null ? null : (
        <>
          , com <Strong>{percentFormat.format(margin)} de margem</Strong>
        </>
      )}
      .{" "}
    </>
  );
}

function Tone({ up, children }: { up: boolean; children: ReactNode }) {
  return (
    <span className={cn("font-medium", up ? "text-brand-text" : "text-destructive")}>
      {children}
    </span>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** Ends the sentence without doubling the dot of an abbreviated month ("14 de set."). */
function withPeriod(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}
