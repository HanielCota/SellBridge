import {
  orderReviewSearchSchema,
  REVIEW_FILTER_LABELS,
  REVIEW_FILTERS,
  type OrderReviewSearch,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PencilSimpleIcon, ReceiptIcon, StarIcon } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { SegmentedControl } from "@/components/data/segmented-control";
import { SmartDate } from "@/components/data/smart-date";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewDialog, type ReviewTarget } from "@/components/orders/review-dialog";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { listOrderReviews } from "@/features/orders/orders.functions";
import { orderReviewsQueryOptions } from "@/features/orders/orders.queries";
import { displayStoreName } from "@/features/stores/store-name";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

type OrderReviewRow = Awaited<ReturnType<typeof listOrderReviews>>["items"][number];

export const Route = createFileRoute("/_app/pedidos")({
  validateSearch: orderReviewSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, orderReviewsQueryOptions(search)),
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

function OrdersPage() {
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Cada venda aparece por fornecedor. Avalie como ele entregou: as notas formam o score que todos os revendedores veem."
      />
      <OrderFilters />
      <OrderList onReview={setTarget} />
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

function ReviewAction({
  row,
  onReview,
}: {
  row: OrderReviewRow;
  onReview: (target: ReviewTarget) => void;
}) {
  const target: ReviewTarget = {
    orderId: row.orderId,
    externalOrderId: row.externalOrderId,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    review: row.review,
  };
  if (row.review) {
    return (
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
          <StarIcon weight="fill" className="size-4 text-amber-500" aria-hidden="true" />
          <span aria-hidden="true">{row.review.rating}</span>
          <span className="sr-only">Sua nota: {row.review.rating} de 5</span>
        </span>
        {row.canReview ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar avaliação de ${row.supplierName}`}
            onClick={() => onReview(target)}
          >
            <PencilSimpleIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    );
  }
  if (!row.canReview) {
    return null;
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="group/rate border-amber-500/30 bg-amber-500/[0.06] hover:border-amber-500/50 hover:bg-amber-500/15 group-hover/row:border-amber-500/45"
      onClick={() => onReview(target)}
    >
      <span className="relative size-4" aria-hidden="true">
        <StarIcon className="absolute inset-0 size-4 text-amber-500 transition-opacity duration-150 group-hover/rate:opacity-0" />
        {/* The filled star swings in with a little overshoot, like it just got picked. */}
        <StarIcon
          weight="fill"
          className="absolute inset-0 size-4 scale-50 text-amber-500 opacity-0 drop-shadow-[0_0_6px_rgb(245_158_11/0.6)] transition-[opacity,scale,rotate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/rate:scale-115 group-hover/rate:-rotate-[18deg] group-hover/rate:opacity-100 motion-reduce:transition-opacity motion-reduce:group-hover/rate:scale-100 motion-reduce:group-hover/rate:rotate-0"
        />
      </span>
      Avaliar
    </Button>
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
        <OrderStatusBadge status={row.status} />
        <ReviewAction row={row} onReview={onReview} />
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
  const query = useQuery(orderReviewsQueryOptions(search));

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando pedidos">
        <Skeleton className="h-96 rounded-3xl" />
      </div>
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
