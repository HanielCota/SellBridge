import { formatCents } from "@sellbridge/shared/money";
import { ORDER_STATUS_LABELS } from "@sellbridge/shared/schemas";
import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { SmartDate } from "@/components/data/smart-date";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { OrderBreakdown } from "@/components/financials/order-parts";
import { OrderOperations } from "@/components/fulfillment/order-dialog";
import { ORDER_TONES, OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Button } from "@/components/ui/button";
import { displayBuyerName } from "@/features/orders/buyer-name";
import type { getOrderPageFn } from "@/features/orders/orders.functions";
import { displayStoreName } from "@/features/stores/store-name";

type OrderPageData = Awaited<ReturnType<typeof getOrderPageFn>>;

/** A titled block of the page; the title names it for screen readers too. */
function PageSection({
  id,
  title,
  card = false,
  children,
}: {
  id: string;
  title: string;
  /** On its own card, like the summaries; the shipping block keeps the page's background. */
  card?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={card ? "surface-card rounded-3xl bg-card p-5" : undefined}
    >
      <h2 id={id} className="mb-3 text-xs text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function OrderHeader({ page }: { page: OrderPageData }) {
  const { order } = page;
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* The order number never breaks at its hyphens; only a very long one wraps anywhere. */}
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            Pedido{" "}
            <span className="inline-block max-w-full break-all">{order.externalOrderId}</span>
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {displayStoreName(order.storeName)} · {displayBuyerName(order.buyerName)} ·{" "}
          <SmartDate date={order.orderedAt} />
        </p>
      </div>
      {page.marketplaceUrl ? (
        <Button asChild variant="outline">
          <a href={page.marketplaceUrl} target="_blank" rel="noopener noreferrer">
            Ver no Mercado Livre
            <ArrowSquareOutIcon aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    </header>
  );
}

/** What was sold: each line with its price and what the supplier charges for it. */
function OrderItems({ items }: { items: OrderPageData["order"]["items"] }) {
  return (
    <PageSection id="order-items" title="Itens" card>
      <ul className="divide-y">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {item.quantity} × {formatCents(item.unitPriceCents)} · custo{" "}
                {formatCents(item.unitCostCents)} cada
              </p>
            </div>
            <p className="font-medium tabular-nums">
              {formatCents(item.quantity * item.unitPriceCents)}
            </p>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

/** Each status the order went through, newest first, like the shipment's own timeline. */
function OrderProgress({ history }: { history: OrderPageData["history"] }) {
  return (
    <DotTimeline>
      {history.toReversed().map((entry) => (
        <DotTimelineItem
          key={`${entry.status}-${entry.at.getTime()}`}
          dotClassName={TONE_DOT_CLASSES[ORDER_TONES[entry.status]]}
          date={entry.at}
        >
          <span className="text-foreground">{ORDER_STATUS_LABELS[entry.status]}</span>
        </DotTimelineItem>
      ))}
    </DotTimeline>
  );
}

function OrderAside({ page }: { page: OrderPageData }) {
  return (
    <aside
      className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
      aria-label="Sobre o pedido"
    >
      <PageSection id="order-money" title="Dinheiro" card>
        <OrderBreakdown row={page.finance} />
      </PageSection>
      <PageSection id="order-progress" title="Andamento do pedido" card>
        <OrderProgress history={page.history} />
      </PageSection>
    </aside>
  );
}

/** One order on its own page: what sold, what it left, how it went, and its parcels. */
export function OrderPageView({ page }: { page: OrderPageData }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link to="/pedidos">
          <ArrowLeftIcon aria-hidden="true" />
          Pedidos
        </Link>
      </Button>
      <OrderHeader page={page} />
      {/* The summary comes first in the page, so a phone shows it right under the heading. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <OrderAside page={page} />
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <OrderItems items={page.order.items} />
          <PageSection id="order-shipping" title="Envio">
            <OrderOperations orderId={page.order.id} />
          </PageSection>
        </div>
      </div>
    </div>
  );
}
