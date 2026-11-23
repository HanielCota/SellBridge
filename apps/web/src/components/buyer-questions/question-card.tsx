import type { BuyerQuestionRow } from "@sellbridge/database/repositories";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ProductVisual } from "@/components/catalog/product-visual";
import { TonePill } from "@/components/data/tone-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { answerBuyerQuestionFn } from "@/features/buyer-questions/buyer-questions.functions";
import { questionSeal } from "@/features/buyer-questions/question-seal";
import {
  answerLengthLabel,
  answerProblem,
  contactProblem,
  MAX_ANSWER_LENGTH,
} from "@/features/buyer-questions/answer-text";
import { errorMessage } from "@/lib/errors";
import { formatAbsoluteTime } from "@/lib/relative-time";

/** The publication the question is about: its photo, title and store, and a way to open it. */
function QuestionListing({ question }: { question: BuyerQuestionRow }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="block size-12 shrink-0 overflow-hidden rounded-xl">
        <ProductVisual
          imageUrl={question.imageUrl}
          title={question.listingTitle}
          categoryName={null}
          compact
          className="size-12"
        />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium">{question.listingTitle}</p>
        <p className="text-footnote text-muted-foreground">
          {question.storeName ?? "Mercado Livre"}
          {question.itemUrl === null ? null : (
            <>
              {" · "}
              <a
                href={question.itemUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand-text underline-offset-4 hover:underline"
              >
                Ver anúncio
                <ArrowSquareOutIcon className="size-3.5" aria-hidden="true" />
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** Publishes the answer; on success the lists, the menu badge and the bell look again. */
function useAnswerQuestion(questionId: string, onProblem: (problem: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => answerBuyerQuestionFn({ data: { questionId, text } }),
    onSuccess: async () => {
      toast.success("Resposta publicada no Mercado Livre.");
      await queryClient.invalidateQueries({ queryKey: ["buyer-questions"] });
      await queryClient.invalidateQueries({
        queryKey: ["listings", "tickets", "attention-counts"],
      });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    // The typed text stays in the field: the reseller fixes it or sends it again.
    onError: (error) => onProblem(errorMessage(error)),
  });
}

function AnswerForm({ question }: { question: BuyerQuestionRow }) {
  const fieldId = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const answer = useAnswerQuestion(question.id, setProblem);
  const sending = answer.isPending || question.answerSending;
  // A contact is pointed out while typing, not only on send.
  const shownProblem = problem ?? contactProblem(text);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) {
      return;
    }
    const refusal = answerProblem(text);
    setProblem(refusal);
    if (refusal === null) {
      answer.mutate(text);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <Label htmlFor={fieldId}>Sua resposta</Label>
      <Textarea
        id={fieldId}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(null);
        }}
        placeholder="Exemplo: Serve sim, do modelo 2015 em diante. Enviamos em até 2 dias úteis."
        aria-invalid={shownProblem !== null || text.length > MAX_ANSWER_LENGTH}
        aria-describedby={`${fieldId}-hint ${fieldId}-problem`}
        disabled={sending}
      />
      <p id={`${fieldId}-hint`} className="text-footnote text-muted-foreground">
        {answerLengthLabel(text)} Não escreva telefone, e-mail ou links: o Mercado Livre bloqueia a
        resposta.
      </p>
      <p
        id={`${fieldId}-problem`}
        role="alert"
        aria-live="polite"
        className="text-sm text-destructive"
      >
        {shownProblem}
      </p>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={sending}>
        {sending ? "Enviando..." : "Responder"}
      </Button>
    </form>
  );
}

function SettledAnswer({ question }: { question: BuyerQuestionRow }) {
  if (question.answerText === null) {
    return null;
  }
  return (
    <div className="space-y-1 rounded-2xl bg-muted/60 px-4 py-3">
      <p className="text-footnote text-muted-foreground">
        {question.answeredInSellBridge
          ? "Sua resposta, enviada pelo SellBridge"
          : "Resposta dada no Mercado Livre"}
      </p>
      <p className="text-sm whitespace-pre-line">{question.answerText}</p>
    </div>
  );
}

function UnderReviewNote() {
  return (
    <p className="text-sm text-muted-foreground">
      O Mercado Livre está analisando esta pergunta. Você poderá responder quando a análise
      terminar.
    </p>
  );
}

/** One buyer question: the publication, how long it waited, the question and the answer box. */
export function QuestionCard({ question, now }: { question: BuyerQuestionRow; now: Date }) {
  const seal = questionSeal(question, now);
  return (
    <article className="surface-card space-y-4 rounded-3xl bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <QuestionListing question={question} />
        <TonePill tone={seal.tone} label={seal.label} timeBased={seal.timeBased} />
      </div>
      <div className="space-y-1">
        <p className="text-subhead font-medium whitespace-pre-line">
          {question.text === "" ? "Pergunta sem texto" : `“${question.text}”`}
        </p>
        <p className="text-footnote text-muted-foreground" suppressHydrationWarning>
          Perguntado em {formatAbsoluteTime(question.askedAt)}
        </p>
      </div>
      {question.status === "unanswered" ? <AnswerForm question={question} /> : null}
      {question.status === "under_review" ? <UnderReviewNote /> : null}
      <SettledAnswer question={question} />
    </article>
  );
}
