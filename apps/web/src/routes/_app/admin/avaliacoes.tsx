import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ModeratedReviewList } from "@/components/admin-reviews/moderated-review-list";
import { PageHeader } from "@/components/layout/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  moderationSearchSchema,
  type ModerationSearch,
} from "@/features/admin-reviews/moderation-search";
import { moderatedReviewsQueryOptions } from "@/features/admin-reviews/reviews.functions";
import { prefetchOnServer } from "@/lib/prefetch";

function queryInput(search: ModerationSearch) {
  return { withCommentOnly: search.withComment, page: search.page };
}

/**
 * Supplier reviews of every supplier, for moderation only (`reviews.moderate`: supervisors and
 * admins). Agents land on the inbox, as on the audit page; the server function refuses them too.
 */
export const Route = createFileRoute("/_app/admin/avaliacoes")({
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "reviews.moderate")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  validateSearch: moderationSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, moderatedReviewsQueryOptions(queryInput(search))),
  head: () => ({ meta: [{ title: "Avaliações (equipe) | SellBridge" }] }),
  component: ReviewModerationPage,
});

function useUpdateSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  return (patch: Partial<ModerationSearch>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
}

function ReviewModerationPage() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const query = useQuery(moderatedReviewsQueryOptions(queryInput(search)));
  return (
    <>
      <PageHeader
        title="Avaliações"
        description="O que os revendedores escreveram sobre os fornecedores. Só a equipe lê os comentários; o fornecedor e os outros revendedores veem só a nota e os motivos."
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="with-comment"
          checked={search.withComment}
          onCheckedChange={(checked) => updateSearch({ withComment: checked === true, page: 1 })}
        />
        <Label htmlFor="with-comment" className="font-normal">
          Só com comentário
        </Label>
      </div>
      <section
        aria-label="Avaliações dos revendedores"
        className="surface-card rounded-3xl bg-card p-5 sm:p-6"
      >
        <ModeratedReviewList
          query={query}
          showSupplier
          emptyText={
            search.withComment
              ? "Nenhuma avaliação com comentário ainda."
              : "Nenhuma avaliação ainda."
          }
          onPageChange={(page) => updateSearch({ page })}
        />
      </section>
    </>
  );
}
