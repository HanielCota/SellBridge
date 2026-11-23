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
import { ProductVisual } from "@/components/catalog/product-visual";
import { OrderNextStep } from "@/components/orders/order-next-step";
import { OrderClaims } from "@/components/marketplace-claims/order-claims";
import { ReviewAction } from "@/components/orders/review-action";
import { ReviewDialog, type ReviewTarget } from "@/components/orders/review-dialog";
import { OrderReturns } from "@/components/returns/order-returns";
import { ORDER_TONES, OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LISTING_LINK_WAITING_MESSAGE, listingLink } from "@/features/listings/listing-link";
import { displayBuyerName } from "@/features/orders/buyer-name";
import { orderItemsLabel } from "@/features/orders/order-items-label";
import type { getOrderPageFn } from "@/features/orders/orders.functions";
import { TalkToSupportButton } from "@/components/support/talk-to-support-button";
import { TalkToSupplierButton } from "@/components/supplier-support/talk-to-supplier-button";
import { supportTicketSearch } from "@/features/support/talk-to-support";

type OrderPageData = Awaited<ReturnType<typeof getOrderPageFn>>;
type OrderItem = OrderPageData["order"]["items"][number];

/** A titled block of the page; the title names it for screen readers too. */
function PageSection({
  id,
  title,
  card = false,
  focusable = false,
  children,
}: {
  id: string;
  title: string;
  /** A jump target of the next-step card: it takes the keyboard focus when reached. */
  focusable?: boolean;
  /** On its own card, like the summaries; the shipping block keeps the page's background. */
  card?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={focusable ? id : undefined}
      tabIndex={focusable ? -1 : undefined}
      aria-labelledby={`${id}-title`}
      className={cn(
        card && "surface-card rounded-3xl bg-card p-5",
        focusable && "scroll-mt-24 outline-none",
      )}
    >
      <h2 id={`${id}-title`} className="mb-3 text-xs text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** What sold, under the order number: the number alone says nothing to the reseller. */
function OrderItemsTitle({ items }: { items: OrderPageData["order"]["items"] }) {
  const label = orderItemsLabel(items[0]?.title ?? null, items.length);
  if (label === null) {
    return null;
  }
  return <p className="font-medium">{label}</p>;
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
        <OrderItemsTitle items={order.items} />
        <p className="text-sm text-muted-foreground">
          {order.storeName} · {displayBuyerName(order.buyerName)} ·{" "}
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
function unitCostText(item: OrderItem, costPending: boolean): string {
  if (item.productId !== null) {
    return `custo ${formatCents(item.unitCostCents)} cada`;
  }
  return costPending ? "sem custo informado" : "produto fora do catálogo, sem custo";
}

/** The ad the item sold from, on Mercado Livre; a line saying why when its link has not come. */
function ItemListingLink({
  item,
  marketplace,
}: {
  item: OrderItem;
  marketplace: OrderPageData["order"]["marketplace"];
}) {
  const link = listingLink({
    marketplace,
    status: item.listingStatus,
    externalUrl: item.listingUrl,
  });
  if (link.kind === "none") {
    return null;
  }
  if (link.kind === "waiting") {
    return <p className="mt-1 text-xs text-muted-foreground">{LISTING_LINK_WAITING_MESSAGE}.</p>;
  }
  return (
    <Button asChild variant="outline" size="sm" className="mt-2">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Ver anúncio de ${item.title} no Mercado Livre (abre em outra aba)`}
      >
        Ver anúncio
        <ArrowSquareOutIcon data-icon="inline-end" aria-hidden="true" />
      </a>
    </Button>
  );
}

function OrderItems({
  items,
  marketplace,
  costPending,
}: {
  items: OrderPageData["order"]["items"];
  marketplace: OrderPageData["order"]["marketplace"];
  costPending: boolean;
}) {
  return (
    <PageSection id="order-items" title="Produtos" card>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            {/* The photo tells two variants of one product apart, as the financial list does. */}
            <span className="size-11 shrink-0 overflow-hidden rounded-xl">
              <ProductVisual
                imageUrl={item.imageUrl}
                title={item.title}
                categoryName={item.categoryName}
                compact
                className="size-full"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {item.quantity} × {formatCents(item.unitPriceCents)} ·{" "}
                {unitCostText(item, costPending)}
              </p>
              <ItemListingLink item={item} marketplace={marketplace} />
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
  if (status === "delivered") return `Passou o prazo de ${REVIEW_WINDOW_DAYS} dias para avaliar`;
  return "Dá para avaliar depois da entrega";
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
      <OrderNextStep orderId={page.order.id} />
      <OrderClaims orderId={page.order.id} marketplaceUrl={page.marketplaceUrl} />
      {/* The summary comes first in the page, so a phone shows it right under the heading. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <OrderAside page={page} />
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <OrderReturns orderId={page.order.id} returned={page.order.status === "returned"} />
          <OrderItems
            items={page.order.items}
            marketplace={page.order.marketplace}
            costPending={page.finance.costPending}
          />
          <PageSection id="order-shipping" title="Envio" focusable>
            <OrderOperations orderId={page.order.id} />
          </PageSection>
        </div>
      </div>
    </div>
  );
}
