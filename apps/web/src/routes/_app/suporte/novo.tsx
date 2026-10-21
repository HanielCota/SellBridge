import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { newTicketSearchSchema, type NewTicketSearch } from "@sellbridge/shared/schemas";
import { supportTopicsFor } from "@sellbridge/shared/support-topics";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { AttachmentInput } from "@/components/support/attachment-input";
import { SituationStep, TopicStep } from "@/components/support/new-ticket/choice-steps";
import { DescriptionStep, SendFooter } from "@/components/support/new-ticket/description-step";
import { AnsweredStep } from "@/components/support/new-ticket/step-parts";
import { useNewTicket } from "@/components/support/new-ticket/use-new-ticket";
import { TicketSubjectList, hasTicketSubject } from "@/components/support/ticket-subject";
import { Card, CardContent } from "@/components/ui/card";
import { responsePromise } from "@/features/support/support-copy";
import { getTicketAboutPreview } from "@/features/support/support.functions";

export const Route = createFileRoute("/_app/suporte/novo")({
  validateSearch: newTicketSearchSchema,
  head: () => ({ meta: [{ title: "Novo chamado | SellBridge" }] }),
  component: NewTicketPage,
});

function ChoiceSteps({ flow, kind }: { flow: ReturnType<typeof useNewTicket>; kind: ProfileKind }) {
  const { topic, situation } = flow;
  return (
    <>
      {topic === undefined ? (
        <TopicStep kind={kind} topics={supportTopicsFor(kind)} onPick={flow.pickTopic} />
      ) : (
        <AnsweredStep
          number={1}
          answer={topic.label}
          changeLabel="Alterar o tema"
          onChange={flow.changeTopic}
        />
      )}
      {topic === undefined || !flow.needsSituation ? null : situation === undefined ? (
        <SituationStep situations={topic.situations} onPick={flow.pickSituation} />
      ) : (
        <AnsweredStep
          number={2}
          answer={situation.label}
          changeLabel="Alterar o que está acontecendo"
          onChange={flow.changeSituation}
        />
      )}
    </>
  );
}

function WritingSteps({ flow }: { flow: ReturnType<typeof useNewTicket> }) {
  const { topic, situation, attachments } = flow;
  if (topic === undefined || !flow.isReadyToWrite) {
    return null;
  }
  return (
    <>
      <DescriptionStep
        number={flow.needsSituation ? 3 : 2}
        question={situation?.question ?? topic.question}
        example={situation?.example ?? topic.example}
        notice={situation?.notice ?? null}
        value={flow.body}
        isTooShort={flow.showTooShort}
        onChange={flow.writeBody}
        onPaste={attachments.pasteFiles}
      />
      <AttachmentInput
        files={attachments.files}
        rejected={attachments.rejected}
        tip={situation?.attachmentTip ?? null}
        onAdd={attachments.addFiles}
        onRemove={attachments.removeFile}
      />
      <FormErrorAlert
        message={
          flow.sendError === null ? null : `${flow.sendError} O que você escreveu continua aqui.`
        }
      />
      <SendFooter
        promise={responsePromise(situation?.priority ?? "normal")}
        isSending={flow.isSending}
      />
    </>
  );
}

function NewTicketForm({ kind, search }: { kind: ProfileKind; search: NewTicketSearch }) {
  const flow = useNewTicket(kind, search);
  return (
    <form noValidate className="grid gap-6" onSubmit={flow.send}>
      <ChoiceSteps flow={flow} kind={kind} />
      <WritingSteps flow={flow} />
    </form>
  );
}

function NewTicketPage() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader back={<BackLink to="/suporte" label="Suporte" />} title="Novo chamado" />
      <Card>
        <CardContent className="space-y-6">
          <TicketAboutPreview />
          <NewTicketForm kind={session.profileKind} search={search} />
        </CardContent>
      </Card>
    </div>
  );
}

/** What the ticket will be about, when the form was opened from an order, store or listing. */
function TicketAboutPreview() {
  const search = Route.useSearch();
  const ids = { orderId: search.pedido, storeConnectionId: search.loja, listingId: search.anuncio };
  const linked = Object.values(ids).some((id) => id !== undefined);
  const preview = useQuery({
    queryKey: ["tickets", "about-preview", ids],
    queryFn: () => getTicketAboutPreview({ data: ids }),
    enabled: linked,
  });
  if (!linked || preview.data === undefined || !hasTicketSubject(preview.data)) {
    return null;
  }
  return (
    <section className="space-y-2.5 rounded-2xl bg-muted/50 p-4" aria-label="Sobre">
      <h2 className="text-sm text-muted-foreground">O chamado vai junto com</h2>
      <TicketSubjectList subject={preview.data} />
    </section>
  );
}
