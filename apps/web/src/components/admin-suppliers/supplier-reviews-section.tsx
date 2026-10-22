import type { ModeratedSupplierReview } from "@sellbridge/database/repositories";
import { StarIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { ErrorState } from "@/components/feedback/error-state";
import { SectionCard } from "@/components/layout/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  hasComment,
  hasNoReviews,
  reasonLabels,
} from "@/features/admin-suppliers/moderated-reviews";
import { adminSupplierReviewsQueryOptions } from "@/features/admin-suppliers/supplier-reviews.functions";
import { errorMessage } from "@/lib/errors";

const SECTION_TITLE = "Avaliações dos revendedores";
const SECTION_DESCRIPTION =
  "Só a equipe SellBridge lê os comentários. O fornecedor e os outros revendedores veem só a nota e os motivos.";

function ReviewComment({ comment }: { comment: string }) {
  if (!hasComment(comment)) {
    return <p className="text-sm text-muted-foreground">Sem comentário.</p>;
  }
  return <p className="text-sm break-words whitespace-pre-line">{comment}</p>;
}

function ReviewRow({ review }: { review: ModeratedSupplierReview }) {
  const reasons = reasonLabels(review.tags);
  return (
    <li className="space-y-1.5 py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 text-footnote">
        <span className="inline-flex items-center gap-1 font-medium tabular-nums">
          <StarIcon weight="fill" className="size-3.5 text-amber-500" aria-hidden="true" />
          Nota {review.rating} de 5
        </span>
        <SmartDate date={review.createdAt} className="text-muted-foreground" />
      </div>
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

function ReviewList({ supplierId }: { supplierId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery(adminSupplierReviewsQueryOptions(supplierId, page));
  if (query.isPending) {
    return <Skeleton className="h-40 rounded-2xl" aria-label="Carregando avaliações" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (hasNoReviews(query.data)) {
    return (
      <p className="text-footnote text-muted-foreground">
        Quando um revendedor avaliar um pedido deste fornecedor, a avaliação aparece aqui.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <ul className="divide-y">
        {query.data.items.map((review) => (
          <ReviewRow key={review.id} review={review} />
        ))}
      </ul>
      <PaginationBar
        page={query.data.page}
        totalPages={query.data.totalPages}
        total={query.data.total}
        itemLabel={{ one: "avaliação", other: "avaliações" }}
        onPageChange={setPage}
      />
    </div>
  );
}

/**
 * Reviews of the supplier as moderation reads them (`reviews.moderate`): rating, reasons,
 * comment, order and store, newest first. The server refuses anyone without the permission.
 */
export function SupplierReviewsSection({ supplierId }: { supplierId: string }) {
  return (
    <SectionCard title={SECTION_TITLE} description={SECTION_DESCRIPTION}>
      {/* Keyed: moving to another supplier starts again on page 1. */}
      <ReviewList key={supplierId} supplierId={supplierId} />
    </SectionCard>
  );
}
