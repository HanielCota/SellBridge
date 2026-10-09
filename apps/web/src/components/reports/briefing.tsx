import { cn } from "cn";
import { formatPointDate } from "@/features/reports/dashboard-metrics";
import { type SummaryFigures, trendOf } from "@/features/reports/dashboard-insights";

const wholeMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function money(cents: number): string {
  return wholeMoney.format(cents / 100);
}

interface BriefingProps {
  summary: SummaryFigures;
  previous: SummaryFigures;
  /** "nos últimos 30 dias", "no período escolhido"... */
  periodPhrase: string;
  comparisonPhrase: string;
  bestDay: { date: string; value: number } | null;
  bucket: "day" | "week";
}

function ProfitTrendSentence({
  summary,
  previous,
  comparisonPhrase,
}: Omit<BriefingProps, "periodPhrase" | "bestDay" | "bucket">) {
  const trend = trendOf(summary.profitCents, previous.profitCents);
  if (!trend || trend.direction === "flat") {
    return null;
  }
  if (trend.isOffScale) {
    return <> Quase não houve vendas {comparisonPhrase} para comparar.</>;
  }
  const percent = trend.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <>
      {" "}
      <span
        className={
          trend.direction === "up"
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }
      >
        {percent}% {trend.direction === "up" ? "a mais" : "a menos"}
      </span>{" "}
      de lucro que {comparisonPhrase}.
    </>
  );
}

/** The period told as a sentence: what you kept, from how much you sold, and how it moved. */
export function Briefing({
  summary,
  previous,
  periodPhrase,
  comparisonPhrase,
  bestDay,
  bucket,
}: BriefingProps) {
  const isLoss = summary.profitCents < 0;
  return (
    <section aria-label="Resumo do período" className="space-y-3">
      <h2 className="max-w-3xl text-[28px] leading-[1.15] font-semibold tracking-[-0.025em] text-balance sm:text-[34px]">
        {isLoss ? "Você teve prejuízo de " : "Você ficou com "}
        <span className={cn(isLoss ? "text-destructive" : "text-brand-strong dark:text-brand")}>
          {money(Math.abs(summary.profitCents))}
        </span>
        {isLoss ? "" : " de lucro"} {periodPhrase}.
      </h2>
      <p className="max-w-2xl text-[17px] leading-relaxed text-pretty text-muted-foreground">
        Foram {money(summary.revenueCents)} em vendas, em {summary.orders.toLocaleString("pt-BR")}{" "}
        {summary.orders === 1 ? "pedido" : "pedidos"}.
        <ProfitTrendSentence
          summary={summary}
          previous={previous}
          comparisonPhrase={comparisonPhrase}
        />
        {bestDay ? (
          <>
            {" "}
            {bucket === "week" ? "A melhor semana começou em" : "O melhor dia foi"}{" "}
            {formatPointDate(bestDay.date)}, com {money(bestDay.value)} de lucro.
          </>
        ) : null}
      </p>
    </section>
  );
}
