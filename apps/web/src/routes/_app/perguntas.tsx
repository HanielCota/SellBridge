import { ChatCircleTextIcon } from "@phosphor-icons/react";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { QuestionCard } from "@/components/buyer-questions/question-card";
import { UnderlineTabs } from "@/components/data/underline-tabs";
import type { FilterTab } from "@/components/data/filter-tabs";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type BuyerQuestionView,
  buyerQuestionsQueryOptions,
} from "@/features/buyer-questions/buyer-questions.queries";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import { useQuery } from "@tanstack/react-query";
import { useNow } from "@/hooks/use-now";
import { errorMessage } from "@/lib/errors";

const questionsSearchSchema = z.object({
  aba: optionalParameter(z.enum(["respondidas"])),
});

export const Route = createFileRoute("/_app/perguntas")({
  validateSearch: questionsSearchSchema,
  beforeLoad: ({ context }) => {
    // Off (BUYER_QUESTIONS_ENABLED), the page does not exist.
    if (!context.session.buyerQuestionsEnabled) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: "Perguntas | SellBridge" }] }),
  component: QuestionsPage,
});

const EMPTY_TEXT: Record<BuyerQuestionView, { title: string; description: string }> = {
  waiting: {
    title: "Nenhuma pergunta esperando resposta",
    description:
      "Quando um comprador perguntar algo num anúncio seu do Mercado Livre, a pergunta aparece aqui e no sino.",
  },
  settled: {
    title: "Nenhuma pergunta respondida ainda",
    description: "As perguntas que você responder ficam guardadas aqui.",
  },
};

function QuestionsList({ view }: { view: BuyerQuestionView }) {
  const query = useInfiniteQuery(buyerQuestionsQueryOptions(view));
  const now = useNow();
  if (query.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const questions = query.data.pages.flatMap((page) => page.questions);
  if (questions.length === 0) {
    return <EmptyState icon={ChatCircleTextIcon} {...EMPTY_TEXT[view]} />;
  }
  return (
    <div className="space-y-3">
      {questions.map((question) => (
        <QuestionCard key={question.id} question={question} now={now} />
      ))}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Carregando..." : "Ver mais perguntas"}
        </Button>
      ) : null}
    </div>
  );
}

function QuestionsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const view: BuyerQuestionView = search.aba === "respondidas" ? "settled" : "waiting";
  const waiting = useQuery(attentionCountsQueryOptions()).data?.buyerQuestions;
  const tabs: FilterTab<BuyerQuestionView>[] = [
    { value: "waiting", label: "Para responder", count: waiting },
    { value: "settled", label: "Respondidas" },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Perguntas"
        description="O que os compradores perguntam nos seus anúncios do Mercado Livre. Quem responde em menos de 1 hora vende mais: o Mercado Livre mostra o seu tempo de resposta."
      />
      <UnderlineTabs
        legend="Perguntas para responder ou já respondidas"
        tabs={tabs}
        value={view}
        onChange={(next) =>
          void navigate({ search: { aba: next === "settled" ? "respondidas" : undefined } })
        }
      />
      <QuestionsList view={view} />
    </div>
  );
}
