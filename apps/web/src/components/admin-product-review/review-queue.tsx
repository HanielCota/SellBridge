import type { ProductAwaitingReview } from "@sellbridge/database/repositories";
import {
  REVIEW_KIND_LABELS,
  type ReviewKind,
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
import { ToneStatus, type StatusTone } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { CompletenessBadge } from "@/components/supplier-panel/catalog/review-status";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewQueueQueryOptions } from "@/features/admin-product-review/review.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

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
      className="flex max-w-[18rem] min-w-0 items-center gap-3 whitespace-normal select-none [-webkit-touch-callout:none]"
    >
      <ProductVisual
        imageUrl={product.imageUrls[0] ?? null}
        title={product.title}
        categoryName={product.categoryName}
        compact
        className="size-11 shrink-0 rounded-xl"
      />
      <span className="min-w-0">
        {/* Names wrap instead of widening the table past the window (narrow laptops). */}
        <span className="line-clamp-2 font-medium [overflow-wrap:anywhere] underline-offset-4 hover:underline">
          {product.title.length > 0 ? product.title : "Sem título"}
        </span>
        <span className="block text-footnote text-muted-foreground">Código {product.sku}</span>
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

/** A resubmission stands out: the reviewer checks it against the last rejection first. */
const KIND_TONES: Readonly<Record<ReviewKind, StatusTone>> = {
  new: "info",
  resubmission: "warning",
  change: "muted",
};

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
      <span className="block max-w-[14rem] whitespace-normal [overflow-wrap:anywhere]">
        <span className="line-clamp-2">{information.getValue()}</span>
        <span className="block text-footnote text-muted-foreground">
          {information.row.original.supplierCity} - {information.row.original.supplierState}
        </span>
      </span>
    ),
  }),
  columnHelper.accessor("kind", {
    header: () => (
      <HintedText label={TERM_HINTS.reviewKind} className="hinted-term">
        Tipo
      </HintedText>
    ),
    cell: (information) => (
      <ToneStatus
        tone={KIND_TONES[information.getValue()]}
        label={REVIEW_KIND_LABELS[information.getValue()]}
      />
    ),
  }),
  columnHelper.display({
    id: "completeness",
    header: () => (
      <HintedText label={TERM_HINTS.completeness} className="hinted-term">
        Completude
      </HintedText>
    ),
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
      <div className="text-sm text-muted-foreground">
        <p>{product.supplierName}</p>
        <p>
          {REVIEW_KIND_LABELS[product.kind]} · <SubmittedAt product={product} />
        </p>
      </div>
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
        title="Nenhum produto em análise"
        description="Os produtos enviados pelos fornecedores aparecem aqui."
      />
    );
  }
  return (
    <DataTable
      columns={queueColumns}
      data={query.data.items}
      caption="Produtos em análise, do mais antigo ao mais novo"
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
      />
      <SearchInput
        label="Buscar produtos em análise"
        placeholder="Buscar por título, código ou fornecedor"
        value={term}
        onValueChange={setTerm}
      />
      <div aria-busy={query.isFetching}>
        <QueueTable query={query} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
