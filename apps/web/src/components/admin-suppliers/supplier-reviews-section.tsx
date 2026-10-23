import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ModeratedReviewList } from "@/components/admin-reviews/moderated-review-list";
import { SectionCard } from "@/components/layout/section-card";
import { moderatedReviewsQueryOptions } from "@/features/admin-reviews/reviews.functions";

const SECTION_TITLE = "Avaliações dos revendedores";
const SECTION_DESCRIPTION =
  "Só a equipe SellBridge lê os comentários. O fornecedor e os outros revendedores veem só a nota e os motivos.";

function SupplierReviewList({ supplierId }: { supplierId: string }) {
  const [page, setPage] = useState(1);
  // Every review here, with or without a comment: it is the supplier's whole record.
  const query = useQuery(
    moderatedReviewsQueryOptions({ supplierId, withCommentOnly: false, page }),
  );
  return (
    <ModeratedReviewList
      query={query}
      showSupplier={false}
      emptyText="Quando um revendedor avaliar um pedido deste fornecedor, a avaliação aparece aqui."
      onPageChange={setPage}
    />
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
      <SupplierReviewList key={supplierId} supplierId={supplierId} />
    </SectionCard>
  );
}
