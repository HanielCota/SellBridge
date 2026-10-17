import type { ProductAwaitingReview } from "@sellbridge/database/repositories";
import {
  REVIEW_KIND_LABELS,
  type ReviewQueueSearch,
} from "@sellbridge/shared/supplier-product-review";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ProductVisual } from "@/components/catalog/product-visual";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { CompletenessBadge } from "@/components/supplier-panel/catalog/review-status";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewQueueQueryOptions } from "@/features/admin-product-review/review.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";

type QueueResult = UseQueryResult<{
  items: ProductAwaitingReview[];
  page: number;
  totalPages: number;
  total: number;
}>;

function ProductCell({ product }: { product: ProductAwaitingReview }) {
  return (
    <Link
      to="/admin/fornecedores/analise/$productId"
      params={{ productId: product.id }}
      className="flex min-w-0 items-center gap-3"
    >
      <ProductVisual
        imageUrl={product.imageUrls[0] ?? null}
        title={product.title}
        categoryName={product.categoryName}
        compact
        className="size-11 shrink-0 rounded-xl"
      />
      <span className="min-w-0">
        <span className="block truncate font-medium underline-offset-4 hover:underline">
          {product.title.length > 0 ? product.title : "Sem título"}
        </span>
        <span className="block text-footnote text-muted-foreground">SKU {product.sku}</span>
      </span>
    </Link>
  );
}

function SubmittedAt({ product }: { product: ProductAwaitingReview }) {
  if (product.submittedAt === null) {
    return <span className="text-muted-foreground">Sem data</span>;
  }
  return <SmartDate date={product.submittedAt} />;
}

const columnHelper = createServerColumnHelper<ProductAwaitingReview>();
const queueColumns = columnHelper.columns([
  columnHelper.display({
    id: "product",
    header: "Produto",
    cell: (information) => <ProductCell product={information.row.original} />,
  }),
  columnHelper.accessor("supplierName", {
    header: "Fornecedor",
    cell: (information) => (
      <span>
        <span className="block">{information.getValue()}</span>
        <span className="block text-footnote text-muted-foreground">
          {information.row.original.supplierCity} - {information.row.original.supplierState}
        </span>
      </span>
    ),
  }),
  columnHelper.accessor("kind", {
    header: "Tipo",
    cell: (information) => (
      <ToneStatus
        tone={information.getValue() === "new" ? "info" : "muted"}
        label={REVIEW_KIND_LABELS[information.getValue()]}
      />
    ),
  }),
  columnHelper.display({
    id: "completeness",
    header: "Completude",
    cell: (information) => (
      <CompletenessBadge
        score={information.row.original.completeness.score}
        blocking={information.row.original.completeness.blocking.length}
      />
    ),
  }),
  columnHelper.display({
    id: "submittedAt",
    header: "Enviado",
    cell: (information) => <SubmittedAt product={information.row.original} />,
  }),
]);

function MobileRow({ product }: { product: ProductAwaitingReview }) {
  return (
    <div className="space-y-2">
      <ProductCell product={product} />
      <p className="text-sm text-muted-foreground">
        {product.supplierName} · {REVIEW_KIND_LABELS[product.kind]} ·{" "}
        <SubmittedAt product={product} />
      </p>
      <CompletenessBadge
        score={product.completeness.score}
        blocking={product.completeness.blocking.length}
      />
    </div>
  );
}

function QueueTable({
  query,
  onPageChange,
}: {
  query: QueueResult;
  onPageChange: (page: number) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando produtos em análise" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title="Nenhum produto esperando análise"
        description="Quando um fornecedor enviar um produto pelo painel, ele aparece aqui."
      />
    );
  }
  return (
    <DataTable
      columns={queueColumns}
      data={query.data.items}
      caption="Produtos enviados pelos fornecedores, do mais antigo ao mais novo"
      getRowId={(row) => row.id}
      renderMobileRow={(row) => <MobileRow product={row} />}
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel={{ one: "produto", other: "produtos" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}

interface ReviewQueueProps {
  search: ReviewQueueSearch;
  onSearch: (query: string | undefined) => void;
  onPageChange: (page: number) => void;
}

/** Products the suppliers sent for review, oldest first: the reviewer works from the top. */
export function ReviewQueue({ search, onSearch, onPageChange }: ReviewQueueProps) {
  const query = useQuery(reviewQueueQueryOptions(search));
  const { term, setTerm } = useUrlSearchQuery({ urlQuery: search.query, commitQuery: onSearch });
  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink to="/admin/fornecedores" label="Fornecedores" />}
        title="Produtos em análise"
        description="Aprove para liberar o produto aos revendedores ou reprove dizendo o que corrigir."
      />
      <SearchInput
        label="Buscar produtos em análise"
        placeholder="Buscar por título, SKU ou fornecedor"
        value={term}
        onValueChange={setTerm}
      />
      <div aria-busy={query.isFetching}>
        <QueueTable query={query} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
