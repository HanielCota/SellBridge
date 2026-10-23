import {
  operationsUrlSearchSchema,
  orderReviewSearchSchema,
  REVIEW_FILTER_LABELS,
  REVIEW_FILTERS,
  type OrderReviewSearch,
} from "@sellbridge/shared/schemas";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ReceiptIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import type { z } from "zod";
import { FilterTabs, type FilterTab } from "@/components/data/filter-tabs";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { SegmentedControl } from "@/components/data/segmented-control";
import { SmartDate } from "@/components/data/smart-date";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Operations, operationsQuery } from "@/components/fulfillment/operations";
import { OrderTracking } from "@/components/tracking/order-tracking";
import { ReviewAction } from "@/components/orders/review-action";
import { ReviewDialog, type ReviewTarget } from "@/components/orders/review-dialog";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { ORDER_STATUS_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { operationsQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import type { listOrderReviews } from "@/features/orders/orders.functions";
import { orderReviewsQueryOptions } from "@/features/orders/orders.queries";
import {
  orderTrackingQueryOptions,
  parcelsInTransitQueryOptions,
} from "@/features/tracking/order-tracking.queries";
import { displayStoreName } from "@/features/stores/store-name";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

type OrderReviewRow = Awaited<ReturnType<typeof listOrderReviews>>["items"][number];

const ordersSearchSchema = orderReviewSearchSchema.extend(operationsUrlSearchSchema.shape);
type OrdersSearch = z.infer<typeof ordersSearchSchema>;

/** Only the reviews tab's own params: an operations filter must not refetch the hidden tab. */
function reviewsSearch(search: OrdersSearch): OrderReviewSearch {
  return {
    review: search.review,
    query: search.query,
    page: search.page,
    pageSize: search.pageSize,
  };
}

/** The list and, opened from an order, its parcels: fetched together, not one after the other. */
async function prefetchTracking(queryClient: QueryClient, trackOrder: string | undefined) {
  const order =
    trackOrder === undefined
      ? Promise.resolve()
      : prefetchOnServer(queryClient, orderTrackingQueryOptions(trackOrder));
  await Promise.all([prefetchOnServer(queryClient, parcelsInTransitQueryOptions()), order]);
}

export const Route = createFileRoute("/_app/pedidos/")({
  validateSearch: ordersSearchSchema,
  loaderDeps: ({ search }) => search,
  // Only the visible tab is loaded, and with the same key its list reads.
  loader: ({ context, deps: search }) => {
    if (search.view === "reviews") {
      return prefetchOnServer(context.queryClient, orderReviewsQueryOptions(reviewsSearch(search)));
    }
    if (search.view === "tracking") {
      return prefetchTracking(context.queryClient, search.trackOrder);
    }
    return prefetchOnServer(context.queryClient, operationsQueryOptions(operationsQuery(search)));
  },
  head: () => ({ meta: [{ title: "Pedidos | SellBridge" }] }),
  component: OrdersPage,
});

function useOrdersNavigation() {
  const navigate = useNavigate({ from: Route.fullPath });
  return useCallback(
    (patch: Partial<OrderReviewSearch>) =>
      void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true }),
    [navigate],
  );
}

const VIEW_TABS: readonly FilterTab<OrdersSearch["view"]>[] = [
  { value: "operations", label: "Operação" },
  { value: "reviews", label: "Avaliações" },
  { value: "tracking", label: "Rastreio" },
];

function OrdersPage() {
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  // The tab and the operations filters live in the address: coming back from an order keeps them.
  const updateOperations = useCallback(
    (patch: Partial<OrdersSearch>) => {
      // A search typed just before opening an order lands late: it must not pull the page back.
      if (!/^\/pedidos\/?$/.test(router.latestLocation.pathname)) return;
      void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
    },
    [navigate, router],
  );
  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Encaminhe vendas aos fornecedores, acompanhe a separação, imprima etiquetas e consulte o rastreio."
      />
      <FilterTabs
        legend="Visão dos pedidos"
        tabs={VIEW_TABS}
        value={search.view}
        onChange={(view) => updateOperations({ view })}
      />
      {search.view === "operations" ? (
        <Operations search={search} onChange={updateOperations} />
      ) : null}
      {search.view === "reviews" ? (
        <>
          <OrderFilters />
          <OrderList onReview={setTarget} />
        </>
      ) : null}
      {search.view === "tracking" ? (
        <OrderTracking
          trackOrder={search.trackOrder}
          onTrackOrder={(trackOrder) => updateOperations({ trackOrder })}
        />
      ) : null}
      <ReviewDialog
        target={target}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
          }
        }}
      />
    </>
  );
}

function OrderFilters() {
  const search = Route.useSearch();
  const updateSearch = useOrdersNavigation();
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query }),
  });
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SegmentedControl
        legend="Filtrar pedidos"
        options={REVIEW_FILTERS}
        labels={REVIEW_FILTER_LABELS}
        value={search.review}
        onChange={(review) => updateSearch({ review })}
      />
      <SearchInput
        label="Buscar pedido"
        placeholder="Buscar por pedido ou fornecedor"
        className="flex-1"
        value={term}
        onValueChange={setTerm}
      />
    </div>
  );
}

function OrderRow({
  row,
  onReview,
}: {
  row: OrderReviewRow;
  onReview: (target: ReviewTarget) => void;
}) {
  return (
    <li
      // The hover tint is an inset, rounded layer: an edge-to-edge row background would
      // spill past the card's rounded corners and stretch the inset dividers.
      className="group/row relative isolate flex items-center gap-3 py-3.5 before:pointer-events-none before:absolute before:-inset-x-2.5 before:inset-y-1 before:-z-10 before:rounded-2xl before:bg-foreground/[0.03] before:opacity-0 before:transition-opacity before:duration-150 hover:before:opacity-100 sm:gap-4"
    >
      <SupplierLogo name={row.supplierName} logoUrl={row.supplierLogoUrl} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium">{row.supplierName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.units} {row.units === 1 ? "item" : "itens"} · {row.items}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{row.externalOrderId}</span>
          <span aria-hidden="true">·</span>
          <span>{displayStoreName(row.storeName)}</span>
          <span aria-hidden="true">·</span>
          <SmartDate date={row.orderedAt} />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
        <HintedText label={ORDER_STATUS_HINTS[row.status] ?? "Situação do pedido"}>
          <OrderStatusBadge status={row.status} />
        </HintedText>
        <ReviewAction
          target={{
            orderId: row.orderId,
            externalOrderId: row.externalOrderId,
            supplierId: row.supplierId,
            supplierName: row.supplierName,
            review: row.review,
          }}
          canReview={row.canReview}
          onReview={onReview}
        />
      </div>
    </li>
  );
}

const EMPTY_MESSAGES: Record<OrderReviewSearch["review"], { title: string; description: string }> =
  {
    pending: {
      title: "Nenhum pedido esperando avaliação",
      description:
        "Quando um pedido for entregue, ele aparece aqui para você avaliar o fornecedor.",
    },
    done: {
      title: "Você ainda não avaliou pedidos",
      description: "Avalie os pedidos entregues para formar o score dos fornecedores.",
    },
    all: {
      title: "Nenhum pedido ainda",
      description: "As vendas das suas lojas conectadas aparecem aqui.",
    },
  };

function OrderList({ onReview }: { onReview: (target: ReviewTarget) => void }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(orderReviewsQueryOptions(reviewsSearch(search)));

  if (query.isPending) {
    return (
      <output aria-busy="true" aria-label="Carregando pedidos">
        <Skeleton className="h-96 rounded-3xl" />
      </output>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    const message = search.query
      ? { title: "Nenhum pedido encontrado", description: "Tente outro número ou fornecedor." }
      : EMPTY_MESSAGES[search.review];
    return <EmptyState icon={ReceiptIcon} {...message} />;
  }
  const listSignature = query.data.items.map((row) => `${row.orderId}:${row.supplierId}`).join();
  return (
    <div className="space-y-4" aria-busy={query.isFetching}>
      {/* Old rows dim while the next filter loads, then the new set fades in with a small
          rise. Reduced motion keeps the fade (opacity only) and drops the rise. */}
      <ul
        key={listSignature}
        className={cn(
          "surface-card divide-y rounded-3xl bg-card px-5 transition-opacity animate-in fade-in slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:slide-in-from-bottom-0",
          query.isPlaceholderData && "opacity-60",
        )}
      >
        {query.data.items.map((row) => (
          <OrderRow key={`${row.orderId}:${row.supplierId}`} row={row} onReview={onReview} />
        ))}
      </ul>
      <PaginationBar
        page={query.data.page}
        totalPages={query.data.totalPages}
        total={query.data.total}
        itemLabel={{ one: "pedido", other: "pedidos" }}
        onPageChange={(page) => void navigate({ search: { ...search, page } })}
      />
    </div>
  );
}
