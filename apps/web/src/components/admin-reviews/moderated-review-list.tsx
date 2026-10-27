import type { ModeratedSupplierReview } from "@sellbridge/database/repositories";
import type { Paginated } from "@sellbridge/shared/schemas";
import { StarIcon } from "@phosphor-icons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { hasComment, hasNoReviews, reasonLabels } from "@/features/admin-reviews/moderated-reviews";
import { errorMessage } from "@/lib/errors";

function ReviewComment({ comment }: { comment: string }) {
  if (!hasComment(comment)) {
    return <p className="text-sm text-muted-foreground">Sem comentário.</p>;
  }
  return <p className="text-sm break-words whitespace-pre-line">{comment}</p>;
}

function RatingLine({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium tabular-nums">
      <StarIcon weight="fill" className="size-3.5 text-amber-500" aria-hidden="true" />
      Nota {rating} de 5
    </span>
  );
}

/** One review: who was rated (on the all-suppliers page), the rating, the words, the order. */
function ReviewRow({
  review,
  showSupplier,
}: {
  review: ModeratedSupplierReview;
  showSupplier: boolean;
}) {
  const reasons = reasonLabels(review.tags);
  return (
    <li className="space-y-1.5 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 text-footnote">
        {showSupplier ? (
          <span className="min-w-0 truncate text-sm font-medium">{review.supplierName}</span>
        ) : (
          <RatingLine rating={review.rating} />
        )}
        <SmartDate date={review.createdAt} className="shrink-0 text-muted-foreground" />
      </div>
      {showSupplier ? (
        <p className="text-footnote">
          <RatingLine rating={review.rating} />
        </p>
      ) : null}
      <ReviewComment comment={review.comment} />
      {reasons.length > 0 ? (
        <p className="text-footnote text-muted-foreground">{reasons.join(" · ")}</p>
      ) : null}
      <p className="text-footnote break-words text-muted-foreground">
        {review.storeName} · pedido {review.externalOrderId}
      </p>
    </li>
  );
}

interface ModeratedReviewListProps {
  query: UseQueryResult<Paginated<ModeratedSupplierReview>>;
  /** The all-suppliers page names the supplier on each review; a supplier's own page does not. */
  showSupplier: boolean;
  /** What to say when nothing matches, in the words of the screen that shows the list. */
  emptyText: string;
  onPageChange: (page: number) => void;
}

/** Reviews as moderation reads them, shared by `/admin/avaliacoes` and the supplier page. */
export function ModeratedReviewList({
  query,
  showSupplier,
  emptyText,
  onPageChange,
}: ModeratedReviewListProps) {
  if (query.isPending) {
    return <Skeleton className="h-40 rounded-2xl" aria-label="Carregando avaliações" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (hasNoReviews(query.data)) {
    return <p className="text-footnote text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="space-y-5">
      <ul className="divide-y">
        {query.data.items.map((review) => (
          <ReviewRow key={review.id} review={review} showSupplier={showSupplier} />
        ))}
      </ul>
      <PaginationBar
        page={query.data.page}
        totalPages={query.data.totalPages}
        total={query.data.total}
        itemLabel={{ one: "avaliação", other: "avaliações" }}
        onPageChange={onPageChange}
      />
    </div>
  );
}
