import { reviewQueueSearchSchema } from "@sellbridge/shared/supplier-product-review";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReviewQueue } from "@/components/admin-product-review/review-queue";
import { reviewQueueQueryOptions } from "@/features/admin-product-review/review.queries";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/fornecedores/analise/")({
  validateSearch: reviewQueueSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, reviewQueueQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Produtos em análise (admin) | SellBridge" }] }),
  component: ReviewQueuePage,
});

function ReviewQueuePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ReviewQueue
      search={search}
      onSearch={(query) =>
        void navigate({ search: (previous) => ({ ...previous, query, page: 1 }), replace: true })
      }
      onPageChange={(page) =>
        void navigate({ search: (previous) => ({ ...previous, page }), replace: true })
      }
    />
  );
}
