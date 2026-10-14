import { formatCents } from "@sellbridge/shared/money";
import { ORDER_STATUS_LABELS } from "@sellbridge/shared/schemas";
import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { OrderBreakdown } from "@/components/financials/order-parts";
import { OrderOperations } from "@/components/fulfillment/order-dialog";
import { ORDER_TONES, OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Button } from "@/components/ui/button";
import type { getOrderPageFn } from "@/features/orders/orders.functions";
import { displayStoreName } from "@/features/stores/store-name";
import { cn } from "@/lib/utils";

type OrderPageData = Awaited<ReturnType<typeof getOrderPageFn>>;

/** A titled block of the page; the title names it for screen readers too. */
function PageSection({
  id,
  title,
  className,
  children,
}: {
  id: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={className}>
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
          <h1 className="text-2xl font-semibold tracking-tight text-balance break-all">
            Pedido {order.externalOrderId}
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {displayStoreName(order.storeName)} · {order.buyerName ?? "Comprador não informado"} ·{" "}
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
    <PageSection id="order-items" title="Itens" className="surface-card rounded-3xl bg-card p-5">
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
    <ol className="relative space-y-3 before:absolute before:top-1.5 before:bottom-1.5 before:left-[3px] before:w-px before:bg-border">
      {history.toReversed().map((entry) => (
        <li
          key={`${entry.status}-${new Date(entry.at).getTime()}`}
          className="relative grid grid-cols-[7px_minmax(0,1fr)_auto] gap-3"
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 size-[7px] rounded-full ring-2 ring-card",
              TONE_DOT_CLASSES[ORDER_TONES[entry.status]],
            )}
          />
          <span className="text-footnote text-foreground">{ORDER_STATUS_LABELS[entry.status]}</span>
          <SmartDate date={entry.at} className="text-footnote text-muted-foreground" />
        </li>
      ))}
    </ol>
  );
}

function OrderAside({ page }: { page: OrderPageData }) {
  return (
    <aside
      className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
      aria-label="Sobre o pedido"
    >
      <PageSection
        id="order-money"
        title="Dinheiro"
        className="surface-card rounded-3xl bg-card p-5"
      >
        <OrderBreakdown row={page.finance} />
      </PageSection>
      <PageSection
        id="order-progress"
        title="Andamento do pedido"
        className="surface-card rounded-3xl bg-card p-5"
      >
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
            <OrderOperations orderId={page.order.id} showOrderNumber={false} />
          </PageSection>
        </div>
      </div>
    </div>
  );
}
