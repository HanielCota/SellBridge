import { formatCents } from "@sellbridge/shared/money";
import { formatPercent } from "@/lib/percent";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  bestPoint,
  explainRevenue,
  OFF_SCALE_PERCENT,
  profitMargin,
  trendOf,
} from "@/features/reports/dashboard-insights";
import type { TimeBucket } from "@sellbridge/shared/period-range";
import {
  firstDayWithin,
  formatAxisDate,
  formatPointDate,
  type MetricPoint,
} from "@/features/reports/dashboard-metrics";

interface Totals {
  revenueCents: number;
  orders: number;
  profitCents: number;
  pendingCostOrders: number;
  pendingCostRevenueCents: number;
}

interface PeriodSummaryProps {
  current: Totals;
  previous: Totals;
  points: MetricPoint[];
  bucket: TimeBucket;
  /** First day of the period (YYYY-MM-DD): a partial first week is named from it. */
  fromDate: string;
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
  fromDate,
  className,
}: PeriodSummaryProps) {
  const best = points.length > 1 ? bestPoint(points, (point) => point.revenueCents) : null;
  return (
    <p
      className={cn(
        "max-w-[60ch] text-[1.0625rem] leading-relaxed text-muted-foreground text-pretty",
        className,
      )}
    >
      <ProfitSentence current={current} previous={previous} />
      <PendingCostNote current={current} />
      <Headline current={current} previous={previous} />
      {best ? (
        <>
          {" "}
          {BEST_BUCKET_LEAD[bucket]}
          <Strong>{withPeriod(bestBucketLabel(best.date, bucket, fromDate))}</Strong>
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
export function reason(orders: number, ticket: number | null): string {
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

/** Whole reais, except under one real, where rounding would say "R$ 0" for a real loss. */
export function sentenceReais(cents: number): string {
  return Math.abs(cents) < 100 ? formatCents(cents) : wholeReais.format(cents / 100);
}

/**
 * "Você lucrou R$ 1.130,40 no período, 10% a mais que no anterior, com 37% de margem." With
 * cents, as the lists right under it (board 5, approved on 2026-10-25).
 */
function ProfitSentence({ current, previous }: { current: Totals; previous: Totals }) {
  if (current.revenueCents <= 0 && current.profitCents === 0) {
    return null;
  }
  if (current.profitCents < 0) {
    return (
      <>
        Você teve{" "}
        <span className="font-medium text-destructive">
          prejuízo de {formatCents(-current.profitCents)}
        </span>{" "}
        no período.{" "}
      </>
    );
  }
  const trend = trendOf(current.profitCents, previous.profitCents);
  const margin = profitMargin(current);
  const moved = trend !== null && trend.direction !== "flat";
  return (
    <>
      Você lucrou <Strong>{formatCents(current.profitCents)}</Strong> no período
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
          , com <Strong>{formatPercent(margin)} de margem</Strong>
        </>
      )}
      .{" "}
    </>
  );
}

/** "R$ 120 em 1 venda com custo pendente ficou fora do lucro." Only when there is some. */
function PendingCostNote({ current }: { current: Totals }) {
  if (current.pendingCostOrders === 0) {
    return null;
  }
  const one = current.pendingCostOrders === 1;
  return (
    <>
      <Strong>{formatCents(current.pendingCostRevenueCents)}</Strong> em {current.pendingCostOrders}{" "}
      {one ? "venda" : "vendas"} com custo pendente {one ? "ficou" : "ficaram"} fora do lucro.{" "}
    </>
  );
}

export function Tone({ up, children }: { up: boolean; children: ReactNode }) {
  return (
    <span className={cn("font-medium", up ? "text-brand-text" : "text-destructive")}>
      {children}
    </span>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** Ends the sentence without doubling the dot of an abbreviated month ("14 de set."). */
export const BEST_BUCKET_LEAD: Record<TimeBucket, string> = {
  hour: "Seu melhor horário foi às ",
  day: "Seu melhor dia foi ",
  week: "Sua melhor semana começou em ",
};

/** "14h" for an hour; the first day inside the period for a day or a week. */
export function bestBucketLabel(date: string, bucket: TimeBucket, fromDate: string): string {
  if (bucket === "hour") {
    return formatAxisDate(date, "hour");
  }
  return formatPointDate(firstDayWithin(date, fromDate));
}

export function withPeriod(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}
