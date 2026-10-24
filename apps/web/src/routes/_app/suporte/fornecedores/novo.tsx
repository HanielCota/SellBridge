import {
  newSupplierConversationSearchSchema,
  type NewSupplierConversationSearch,
} from "@sellbridge/shared/schemas";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { OrderPicker } from "@/components/supplier-support/new-conversation/order-picker";
import { StoreStep } from "@/components/supplier-support/new-conversation/store-step";
import { ConversationTopicStep } from "@/components/supplier-support/new-conversation/topic-step";
import { useNewConversation } from "@/components/supplier-support/new-conversation/use-new-conversation";
import { AttachmentInput } from "@/components/support/attachment-input";
import { SituationStep } from "@/components/support/new-ticket/choice-steps";
import { DescriptionStep, SendFooter } from "@/components/support/new-ticket/description-step";
import { AnsweredStep } from "@/components/support/new-ticket/step-parts";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { displayStoreName } from "@/features/stores/store-name";

export const Route = createFileRoute("/_app/suporte/fornecedores/novo")({
  validateSearch: newSupplierConversationSearchSchema,
  // A supplier has no stores to write from: its side of these conversations is the inbox.
  beforeLoad: ({ context }) => {
    if (context.session.profileKind === "supplier") {
      throw redirect({ to: "/suporte/revendedores" });
    }
  },
  head: () => ({ meta: [{ title: "Falar com o fornecedor | SellBridge" }] }),
  component: NewConversationPage,
});

type Flow = ReturnType<typeof useNewConversation>;

const SUPPLIER_PROMISE =
  "O fornecedor recebe um aviso e responde aqui no SellBridge. Avisamos você quando ele responder.";

function StoreAndTopicSteps({ flow }: { flow: Flow }) {
  const { store, topic } = flow;
  if (store === undefined) {
    return (
      <StoreStep
        stores={flow.stores.data ?? []}
        total={flow.totalSteps}
        onPick={(id) => flow.pickStore(id)}
      />
    );
  }
  return (
    <>
      <AnsweredStep
        number={1}
        answer={`${displayStoreName(store.storeName)} · ${store.supplierName ?? ""}`}
        changeLabel="Alterar a loja"
        onChange={() => flow.pickStore(null)}
      />
      {topic === undefined ? (
        <ConversationTopicStep total={flow.totalSteps} onPick={flow.pickTopic} />
      ) : (
        <AnsweredStep
          number={2}
          answer={topic.label}
          changeLabel="Alterar o assunto"
          onChange={flow.changeTopic}
        />
      )}
    </>
  );
}

function SituationChoice({ flow }: { flow: Flow }) {
  const { topic, situation } = flow;
  if (topic === undefined || !flow.needsSituation) {
    return null;
  }
  if (situation === undefined) {
    return (
      <SituationStep
        situations={topic.situations}
        step={{ number: 3, total: flow.totalSteps }}
        help="Assim o fornecedor já entende o caso."
        onPick={flow.pickSituation}
      />
    );
  }
  return (
    <AnsweredStep
      number={3}
      answer={situation.label}
      changeLabel="Alterar o que está acontecendo"
      onChange={() => flow.pickSituation(undefined)}
    />
  );
}

function WritingSteps({ flow }: { flow: Flow }) {
  const { store, topic, situation, attachments } = flow;
  if (store === undefined || topic === undefined || !flow.isReadyToWrite) {
    return null;
  }
  return (
    <>
      <DescriptionStep
        number={flow.totalSteps}
        question={situation?.question ?? topic.question}
        example={situation?.example ?? topic.example}
        notice={situation?.notice ?? null}
        value={flow.body}
        isTooShort={flow.showTooShort}
        tooShortMessage="Conte um pouco mais para o fornecedor entender o caso."
        onChange={flow.writeBody}
        onPaste={attachments.pasteFiles}
      />
      <OrderPicker
        storeConnectionId={store.storeConnectionId}
        value={flow.orderId}
        suggested={topic.suggestsOrder}
        prefilled={flow.prefilledOrder}
        onChange={flow.pickOrder}
      />
      <AttachmentInput
        files={attachments.files}
        rejected={attachments.rejected}
        tip={situation?.attachmentTip ?? null}
        onAdd={attachments.addFiles}
        onRemove={attachments.removeFile}
      />
      <p className="text-sm text-muted-foreground">
        Por segurança, não envie telefone, e-mail ou redes sociais. A conversa fica toda aqui.
      </p>
      <FormErrorAlert
        message={
          flow.sendError === null ? null : `${flow.sendError} O que você escreveu continua aqui.`
        }
      />
      <SendFooter
        promise={SUPPLIER_PROMISE}
        isSending={flow.isSending}
        submitLabel="Enviar mensagem"
        showsSupportHours={false}
      />
    </>
  );
}

function NewConversationForm({ search }: { search: NewSupplierConversationSearch }) {
  const flow = useNewConversation(search);
  if (flow.stores.isPending) {
    return <Skeleton className="h-48 rounded-2xl" aria-label="Carregando lojas" />;
  }
  return (
    <form noValidate className="grid gap-6" onSubmit={flow.send}>
      <StoreAndTopicSteps flow={flow} />
      <SituationChoice flow={flow} />
      <WritingSteps flow={flow} />
    </form>
  );
}

function NewConversationPage() {
  const search = Route.useSearch();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        back={<BackLink to="/suporte/fornecedores" label="Fornecedores" />}
        title="Falar com o fornecedor"
        description="Tire dúvidas sobre pedidos, trocas, estoque e produtos com o fornecedor da sua loja."
      />
      <Card>
        <CardContent className="space-y-6">
          <NewConversationForm search={search} />
        </CardContent>
      </Card>
    </div>
  );
}
