import type { TimeBucket } from "@sellbridge/shared/period-range";
import type { SupplierSalesSituation } from "@sellbridge/shared/supplier-panel-sales";
import {
  BEST_BUCKET_LEAD,
  bestBucketLabel,
  reason,
  SentenceTag,
  sentenceReais,
  Strong,
  withPeriod,
} from "@/components/reports/period-summary";
import {
  bestPoint,
  explainRevenue,
  OFF_SCALE_PERCENT,
} from "@/features/reports/dashboard-insights";
import { trendTagParts } from "@/features/reports/trend-tone";

interface Totals {
  /** Net of the earlier sales taken back in the period. */
  receivableCents: number;
  orders: number;
  /** Sales of an earlier period cancelled or returned in this one, and what they were worth. */
  undoneEarlierOrders?: number;
  undoneEarlierReceivableCents?: number;
}

/** What the period's own sales were worth, before the earlier sales taken back in it. */
function soldOf(totals: Totals): Totals {
  return {
    receivableCents: totals.receivableCents + (totals.undoneEarlierReceivableCents ?? 0),
    orders: totals.orders,
  };
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
  const tag = (
    <SentenceTag parts={trendTagParts(current.receivableCents, previous.receivableCents)} />
  );
  if (Math.abs(story.revenue) >= OFF_SCALE_PERCENT) {
    return <>, {tag} o do período anterior.</>;
  }
  const why = reason(story.orders, story.ticket);
  return (
    <>
      , {tag} a {up ? "mais" : "menos"} que no anterior{why ? `:${why}` : "."}
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

/**
 * "Saíram R$ 80 de 1 venda de antes, cancelada ou devolvida no período.": earlier sales the
 * period took back, as the Mercado Livre statement shows them (decision of 23/11/2026).
 */
function UndoneEarlier({ current }: { current: Totals }) {
  const orders = current.undoneEarlierOrders ?? 0;
  if (orders === 0) {
    return null;
  }
  const one = orders === 1;
  return (
    <>
      Saíram <Strong>{sentenceReais(current.undoneEarlierReceivableCents ?? 0)}</Strong> de {orders}{" "}
      {one ? "venda" : "vendas"} de antes,{" "}
      {one ? "cancelada ou devolvida" : "canceladas ou devolvidas"} no período.{" "}
    </>
  );
}

/** The amount to receive in words, and how it moved against the previous period. */
function SoldSentence({ current, previous }: { current: Totals; previous: Totals }) {
  if (current.orders === 0) {
    return <>Nenhuma venda no período. </>;
  }
  if (previous.orders === 0) {
    return (
      <>
        Suas primeiras vendas chegaram: <Strong>{sentenceReais(current.receivableCents)}</Strong> em
        pedidos.{" "}
      </>
    );
  }
  return (
    <>
      Você vendeu <Strong>{sentenceReais(current.receivableCents)}</Strong> no período
      <Change current={current} previous={previous} />{" "}
    </>
  );
}

function AmountSentence({ current, previous }: Omit<SupplierPeriodSummaryProps, "situation">) {
  return (
    <>
      <SoldSentence current={soldOf(current)} previous={soldOf(previous)} />
      <UndoneEarlier current={current} />
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
