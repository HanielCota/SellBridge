import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReviewDecision } from "@/components/admin-product-review/review-decision";
import { ReviewProductPreview } from "@/components/admin-product-review/review-product-preview";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewProductQueryOptions } from "@/features/admin-product-review/review.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/fornecedores/analise/$productId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, reviewProductQueryOptions(params.productId)),
  head: () => ({ meta: [{ title: "Analisar produto (admin) | SellBridge" }] }),
  component: ReviewProductPage,
});

const BACK = <BackLink to="/admin/fornecedores/analise" label="Produtos em análise" />;

function ReviewSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Skeleton className="h-96 rounded-3xl" aria-label="Carregando produto" />
      <Skeleton className="h-72 rounded-3xl" />
    </div>
  );
}

function ReviewProductPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const query = useQuery(reviewProductQueryOptions(productId));
  if (query.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader back={BACK} title="Analisar produto" />
        <ReviewSkeleton />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader back={BACK} title="Analisar produto" />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  const { product, nextProductId } = query.data;
  function goOn() {
    if (nextProductId === null) {
      void navigate({ to: "/admin/fornecedores/analise" });
      return;
    }
    void navigate({
      to: "/admin/fornecedores/analise/$productId",
      params: { productId: nextProductId },
    });
  }
  return (
    <div className="space-y-6">
      <PageHeader
        back={BACK}
        title="Analisar produto"
        description={`${product.supplierName} · SKU ${product.sku}`}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ReviewProductPreview product={product} />
        <ReviewDecision key={product.id} product={product} onDecided={goOn} />
      </div>
    </div>
  );
}
