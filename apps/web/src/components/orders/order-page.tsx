import { formatCents } from "@sellbridge/shared/money";
import { REVIEW_WINDOW_DAYS } from "@sellbridge/shared/supplier-score";
import { ORDER_STATUS_LABELS } from "@sellbridge/shared/schemas";
import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Link, useCanGoBack, useRouter, useSearch } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { DotTimeline, DotTimelineItem } from "@/components/data/dot-timeline";
import { SmartDate } from "@/components/data/smart-date";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { OrderBreakdown } from "@/components/financials/order-parts";
import { SupplierCreditLines } from "@/components/financials/supplier-credit";
import { OrderOperations } from "@/components/fulfillment/order-dialog";
import { ReviewAction } from "@/components/orders/review-action";
import { ReviewDialog, type ReviewTarget } from "@/components/orders/review-dialog";
import { ORDER_TONES, OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Button } from "@/components/ui/button";
import { displayBuyerName } from "@/features/orders/buyer-name";
import type { getOrderPageFn } from "@/features/orders/orders.functions";
import { TalkToSupportButton } from "@/components/support/talk-to-support-button";
import { TalkToSupplierButton } from "@/components/supplier-support/talk-to-supplier-button";
import { supportTicketSearch } from "@/features/support/talk-to-support";
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
      <div className="flex flex-wrap gap-2">
        <TalkToSupplierButton orderId={order.id} />
        <TalkToSupportButton
          search={supportTicketSearch({ kind: "order", id: order.id, name: order.externalOrderId })}
        />
        {page.marketplaceUrl ? (
          <Button asChild variant="outline">
            <a href={page.marketplaceUrl} target="_blank" rel="noopener noreferrer">
              Ver no Mercado Livre
              <ArrowSquareOutIcon aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

/** What was sold: each line with its price and what the supplier charges for it. */
/** What the supplier charges for one unit, or that it is not known (a listing not ours). */
function unitCostText(item: OrderPageData["order"]["items"][number], costPending: boolean): string {
  if (item.productId !== null) {
    return `custo ${formatCents(item.unitCostCents)} cada`;
  }
  return costPending ? "custo pendente" : "sem custo do catálogo";
}

function OrderItems({
  items,
  costPending,
}: {
  items: OrderPageData["order"]["items"];
  costPending: boolean;
}) {
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
                {item.quantity} × {formatCents(item.unitPriceCents)} ·{" "}
                {unitCostText(item, costPending)}
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

/** Why an order without a rating cannot be rated now: not delivered yet, too late, or no sale. */
function unavailableReview(status: OrderPageData["order"]["status"]): string {
  if (status === "cancelled" || status === "returned") return "Sem avaliação neste pedido";
  if (status === "delivered") return `Prazo de ${REVIEW_WINDOW_DAYS} dias encerrado`;
  return "Disponível depois da entrega";
}

/**
 * Each supplier of the order with its rating, or the call to rate it once delivered: the same
 * action and dialog as the reviews tab.
 */
function SupplierReviews({ page }: { page: OrderPageData }) {
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  return (
    <>
      <ul className="space-y-3">
        {page.reviews.map((supplier) => (
          <li key={supplier.supplierId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm">{supplier.supplierName}</span>
            {supplier.review || supplier.reviewable ? (
              <ReviewAction
                target={{
                  orderId: page.order.id,
                  externalOrderId: page.order.externalOrderId,
                  supplierId: supplier.supplierId,
                  supplierName: supplier.supplierName,
                  review: supplier.review,
                }}
                canReview={supplier.reviewable}
                onReview={setTarget}
              />
            ) : (
              <span className="text-footnote text-muted-foreground">
                {unavailableReview(page.order.status)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <ReviewDialog
        target={target}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </>
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
        <SupplierCreditLines credits={page.supplierCredits} className="mt-3" />
      </PageSection>
      <PageSection id="order-progress" title="Andamento do pedido" card>
        <OrderProgress history={page.history} />
      </PageSection>
      {page.reviews.length > 0 ? (
        <PageSection id="order-review" title="Avaliação" card>
          <SupplierReviews page={page} />
        </PageSection>
      ) : null}
    </aside>
  );
}

/**
 * Back to the orders list. Opened from operations, it steps back in history so the list keeps its
 * filters; opened any other way (a notice, a shared link), it goes to the list itself.
 */
function BackToOrders() {
  const { back } = useSearch({ from: "/_app/pedidos/$orderId" });
  const canGoBack = useCanGoBack();
  const router = useRouter();
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
      <Link
        to="/pedidos"
        onClick={(event) => {
          if (back !== "operations" || !canGoBack) return;
          // A new-tab click keeps the plain link.
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          router.history.back();
        }}
      >
        <ArrowLeftIcon aria-hidden="true" />
        Pedidos
      </Link>
    </Button>
  );
}

/** One order on its own page: what sold, what it left, how it went, and its parcels. */
export function OrderPageView({ page }: { page: OrderPageData }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <BackToOrders />
      <OrderHeader page={page} />
      {/* The summary comes first in the page, so a phone shows it right under the heading. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <OrderAside page={page} />
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <OrderItems items={page.order.items} costPending={page.finance.costPending} />
          <PageSection id="order-shipping" title="Envio">
            <OrderOperations orderId={page.order.id} />
          </PageSection>
        </div>
      </div>
    </div>
  );
}
