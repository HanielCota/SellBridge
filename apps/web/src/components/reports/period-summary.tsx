import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { bestPoint, explainRevenue } from "@/features/reports/dashboard-insights";
import { formatPointDate, type MetricPoint } from "@/features/reports/dashboard-metrics";

interface Totals {
  revenueCents: number;
  orders: number;
}

interface PeriodSummaryProps {
  current: Totals;
  previous: Totals;
  points: MetricPoint[];
  bucket: "day" | "week";
}

const wholePercent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Small changes (a few percent) are noise; the sentence only mentions what clearly moved. */
const NOTABLE_PERCENT = 3;

/**
 * Plain-language reading of the period: did sales go up or down, why (more or fewer sales,
 * each worth more or less), and the best day. The numbers live in the meters beside it.
 */
export function PeriodSummary({ current, previous, points, bucket }: PeriodSummaryProps) {
  const best = points.length > 1 ? bestPoint(points, (point) => point.revenueCents) : null;
  return (
    <p className="max-w-md text-base leading-relaxed text-muted-foreground text-pretty">
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
    return <>Você vendeu o mesmo que no período anterior.</>;
  }
  const up = story.revenue > 0;
  return (
    <>
      Você vendeu{" "}
      <Tone up={up}>
        {wholePercent.format(Math.abs(story.revenue))}% a {up ? "mais" : "menos"}
      </Tone>{" "}
      do que no período anterior.
      {reason(story.orders, story.ticket)}
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
    return ` Foram ${countText}${count === value ? " e " : ", mas "}cada uma ${valueText}.`;
  }
  if (count) {
    return ` Foram ${countText}.`;
  }
  if (value) {
    return ` Cada venda ${valueText}.`;
  }
  return "";
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
