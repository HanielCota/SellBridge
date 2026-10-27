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

/**
 * "Cancelados e devolvidos": money that stayed out, never sales to receive. No comparison and
 * no best day, which would cheer the day with most cancellations.
 */
function LostSentence({ current }: { current: Totals }) {
  if (current.orders === 0) {
    return <>Nenhum pedido cancelado ou devolvido no período.</>;
  }
  const orders =
    current.orders === 1
      ? "1 pedido cancelado ou devolvido"
      : `${current.orders} pedidos cancelados ou devolvidos`;
  return (
    <>
      Ficaram de fora <Strong>{sentenceReais(current.receivableCents)}</Strong> no período, em{" "}
      {orders}.
    </>
  );
}

/** The amount to receive in words, and how it moved against the previous period. */
function AmountSentence({ current, previous }: Omit<SupplierPeriodSummaryProps, "situation">) {
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
  return (
    <>
      Você vai receber <Strong>{sentenceReais(current.receivableCents)}</Strong> no período
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
  if (props.situation === "lost") {
    return (
      <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
        <LostSentence current={props.current} />
      </p>
    );
  }
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
