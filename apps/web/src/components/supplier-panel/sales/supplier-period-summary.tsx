import type { TimeBucket } from "@sellbridge/shared/period-range";
import type { SupplierSalesSituation } from "@sellbridge/shared/supplier-panel-sales";
import {
  BEST_BUCKET_LEAD,
  bestBucketLabel,
  reason,
  sentenceReais,
  Strong,
  Tone,
  withPeriod,
} from "@/components/reports/period-summary";
import {
  bestPoint,
  explainRevenue,
  OFF_SCALE_PERCENT,
} from "@/features/reports/dashboard-insights";

interface Totals {
  receivableCents: number;
  orders: number;
}

interface SupplierPeriodSummaryProps {
  current: Totals;
  previous: Totals;
  points: readonly { date: string; receivableCents: number }[];
  bucket: TimeBucket;
  /** First day of the period (YYYY-MM-DD): a partial first week is named from it. */
  fromDate: string;
  situation: SupplierSalesSituation;
}

const wholePercent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "12% a mais que no anterior: foram 22% mais vendas." — the reseller's two levers. */
function Change({ current, previous }: { current: Totals; previous: Totals }) {
  const story = explainRevenue(
    { revenueCents: current.receivableCents, orders: current.orders },
    { revenueCents: previous.receivableCents, orders: previous.orders },
  );
  if (story.kind !== "change") {
    return <>.</>;
  }
  const up = story.revenue > 0;
  if (Math.abs(story.revenue) >= OFF_SCALE_PERCENT) {
    return (
      <>
        , <Tone up>mais de 10 vezes</Tone> o do período anterior.
      </>
    );
  }
  const why = reason(story.orders, story.ticket);
  return (
    <>
      ,{" "}
      <Tone up={up}>
        {wholePercent.format(Math.abs(story.revenue))}% a {up ? "mais" : "menos"}
      </Tone>{" "}
      que no anterior{why ? `:${why}` : "."}
    </>
  );
}

/** The amount in words; cancelled and returned orders are money that stayed out. */
function AmountSentence({ current, previous, situation }: SupplierPeriodSummaryProps) {
  if (current.orders === 0) {
    return <>Nenhuma venda no período. </>;
  }
  if (previous.orders === 0) {
    return (
      <>
        Suas primeiras vendas chegaram: <Strong>{sentenceReais(current.receivableCents)}</Strong> a
        receber.{" "}
      </>
    );
  }
  const lead = situation === "lost" ? "Ficaram de fora " : "Você vai receber ";
  return (
    <>
      {lead}
      <Strong>{sentenceReais(current.receivableCents)}</Strong> no período
      <Change current={current} previous={previous} />{" "}
    </>
  );
}

/**
 * The supplier's reading of the period, in the reseller dashboard's voice: the amount and how
 * it moved, why (more or fewer sales, each worth more or less), and the best day.
 */
export function SupplierPeriodSummary(props: SupplierPeriodSummaryProps) {
  const { points, bucket, fromDate } = props;
  const best = points.length > 1 ? bestPoint(points, (point) => point.receivableCents) : null;
  return (
    <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
      <AmountSentence {...props} />
      {best ? (
        <>
          {BEST_BUCKET_LEAD[bucket]}
          <Strong>{withPeriod(bestBucketLabel(best.date, bucket, fromDate))}</Strong>
        </>
      ) : null}
    </p>
  );
}
