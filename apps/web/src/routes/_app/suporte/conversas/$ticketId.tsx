import type { ConversationSide } from "@sellbridge/shared/supplier-conversation-topics";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink } from "@/components/layout/page-header";
import { ConversationHeader } from "@/components/supplier-support/conversation-header";
import {
  RESELLER_CONVERSATION,
  SUPPLIER_CONVERSATION,
} from "@/components/supplier-support/conversation-perspective";
import {
  conversationsLabel,
  conversationsPath,
} from "@/components/supplier-support/support-area-tabs";
import { ReplyForm } from "@/components/support/reply-form";
import { TicketThread } from "@/components/support/ticket-thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { canWrite } from "@/features/supplier-support/conversation-state";
import {
  closeMyConversation,
  type getMyConversation,
  markMyConversationRead,
} from "@/features/supplier-support/supplier-support.functions";
import { myConversationQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { messageToMarkRead, useMarkTicketRead } from "@/features/support/use-mark-ticket-read";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/conversas/$ticketId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, myConversationQueryOptions(params.ticketId)),
  head: () => ({ meta: [{ title: "Conversa | Suporte | SellBridge" }] }),
  component: ConversationPage,
});

type ConversationDetail = Awaited<ReturnType<typeof getMyConversation>>;

const PLACEHOLDERS: Record<ConversationSide, string> = {
  reseller: "Escreva para o fornecedor…",
  supplier: "Escreva sua resposta para a loja…",
};

function ConversationPage() {
  const { ticketId } = Route.useParams();
  const query = useQuery(myConversationQueryOptions(ticketId));
  useMarkTicketRead(
    ticketId,
    messageToMarkRead(query.data?.messages ?? [], query.data?.viewerId ?? ""),
    markMyConversationRead,
  );
  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Skeleton className="h-96 rounded-3xl" aria-label="Carregando conversa" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <ConversationView detail={query.data} />;
}

/** "Resolvido": only the store closes; writing again opens the conversation once more. */
function ResolveButton({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => closeMyConversation({ data: { ticketId } }),
    onSuccess: async () => {
      toast.success("Conversa marcada como resolvida");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <CheckCircleIcon aria-hidden="true" />
      Marcar como resolvida
    </Button>
  );
}

function Composer({ detail }: { detail: ConversationDetail }) {
  const queryClient = useQueryClient();
  const { conversation, side } = detail;
  if (!canWrite(side, conversation.status)) {
    return (
      <p className="rounded-3xl border border-dashed px-5 py-4 text-sm text-muted-foreground">
        Conversa resolvida pela loja. Se ela escrever de novo, a conversa volta para você.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ReplyForm
        endpoint={`/api/suporte/conversas/${conversation.id}/mensagens`}
        isClosed={conversation.status === "closed"}
        closedHint="Responder reabre a conversa"
        draftKey={`conversation-${conversation.id}`}
        placeholder={PLACEHOLDERS[side]}
        onSent={async () => {
          toast.success("Mensagem enviada");
          await queryClient.invalidateQueries({ queryKey: ["tickets"] });
        }}
      />
      <p className="text-xs text-muted-foreground">
        Por segurança, telefone, e-mail e redes sociais não podem ser enviados por aqui.
      </p>
    </div>
  );
}

function ConversationView({ detail }: { detail: ConversationDetail }) {
  const { session } = Route.useRouteContext();
  const { conversation, side } = detail;
  // Like "Resolveu?" on a ticket: offered once the supplier has answered.
  const showsResolve = side === "reseller" && conversation.status === "answered";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <BackLink
        to={conversationsPath(session.profileKind)}
        label={conversationsLabel(session.profileKind)}
      />
      <ConversationHeader
        conversation={conversation}
        orders={detail.orders}
        side={side}
        actions={showsResolve ? <ResolveButton ticketId={conversation.id} /> : null}
      />
      <TicketThread
        messages={detail.messages}
        events={detail.events}
        perspective={side === "reseller" ? RESELLER_CONVERSATION : SUPPLIER_CONVERSATION}
      />
      <Composer detail={detail} />
    </div>
  );
}
