import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckCircleIcon, PackageIcon } from "@phosphor-icons/react";
import { useRef, type RefObject } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { OrderLinkPicker } from "@/components/support/order-link-picker";
import { ReplyForm, type ReplyComposerHandle } from "@/components/support/reply-form";
import { ResolvedPrompt } from "@/components/support/resolved-prompt";
import { TicketActionsMenu } from "@/components/support/ticket-actions-menu";
import { TicketCategoryLabel } from "@/components/support/ticket-badges";
import { TicketContextPanel } from "@/components/support/ticket-context-panel";
import { RatingStars, TicketRatingForm } from "@/components/support/ticket-rating";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { TicketThread } from "@/components/support/ticket-thread";
import { IconAction } from "@/components/support/composer-parts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { quickRepliesFor } from "@/features/support/quick-replies";
import {
  closeMyTicket,
  type getMyTicket,
  markMyTicketRead,
} from "@/features/support/support.functions";
import { myTicketQueryOptions } from "@/features/support/support.queries";
import { useMarkTicketRead } from "@/features/support/use-mark-ticket-read";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/$ticketId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, myTicketQueryOptions(params.ticketId)),
  head: () => ({ meta: [{ title: "Chamado | SellBridge" }] }),
  component: TicketPage,
});

type TicketDetail = Awaited<ReturnType<typeof getMyTicket>>;
type ThreadMessage = TicketDetail["messages"][number];

function useCloseTicket(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => closeMyTicket({ data: { ticketId } }),
    onSuccess: async () => {
      toast.success("Chamado encerrado. Se precisar, é só responder que ele reabre.");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function TicketPage() {
  const { ticketId } = Route.useParams();
  const query = useQuery(myTicketQueryOptions(ticketId));
  useMarkTicketRead(ticketId, query.data?.messages.at(-1)?.id, markMyTicketRead);

  if (query.isPending) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96 rounded-3xl" aria-label="Carregando chamado" />
        <Skeleton className="hidden h-72 rounded-3xl lg:block" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <TicketView detail={query.data} />;
}

/** After the thread, once the ticket is closed: the rating, or the one already given. */
function TicketRating({ ticket }: { ticket: TicketDetail["ticket"] }) {
  if (ticket.status !== "closed") {
    return null;
  }
  if (ticket.rating !== null) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Você avaliou este atendimento: <RatingStars rating={ticket.rating} />
      </p>
    );
  }
  return <TicketRatingForm ticketId={ticket.id} />;
}

/** The latest public support answer, which gets the "did this solve it?" prompt. */
function lastSupportAnswerId(detail: TicketDetail): string | null {
  const last = detail.messages.at(-1);
  if (detail.ticket.status !== "answered" || !last?.isAdmin) {
    return null;
  }
  return last.id;
}

function TicketHeader({ detail }: { detail: TicketDetail }) {
  const { ticket } = detail;
  return (
    <header className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <TicketActionsMenu
          ticket={ticket}
          followers={detail.followers}
          notifyMe={detail.notifyMe}
        />
      </div>
      <TicketCategoryLabel category={ticket.category} className="block" />
    </header>
  );
}

function TicketComposer({
  ticket,
  composerRef,
}: {
  ticket: TicketDetail["ticket"];
  composerRef: RefObject<ReplyComposerHandle | null>;
}) {
  const queryClient = useQueryClient();
  return (
    <ReplyForm
      endpoint={`/api/suporte/chamados/${ticket.id}/mensagens`}
      isClosed={ticket.status === "closed"}
      draftKey={ticket.id}
      quickReplies={quickRepliesFor(ticket.category)}
      composerRef={composerRef}
      tools={
        <OrderLinkPicker
          ticketId={ticket.id}
          trigger={
            <IconAction label="Vincular um pedido ao chamado">
              <PackageIcon aria-hidden="true" />
            </IconAction>
          }
        />
      }
      onSent={async () => {
        toast.success("Resposta enviada");
        await queryClient.invalidateQueries({ queryKey: ["tickets"] });
      }}
    />
  );
}

function CloseTicketBar({ closeTicket }: { closeTicket: ReturnType<typeof useCloseTicket> }) {
  return (
    <div className="flex flex-col items-start gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <p className="text-sm text-muted-foreground">Seu problema foi resolvido?</p>
      <Button
        variant="outline"
        size="sm"
        disabled={closeTicket.isPending}
        aria-busy={closeTicket.isPending}
        onClick={() => closeTicket.mutate()}
      >
        <CheckCircleIcon aria-hidden="true" />
        {closeTicket.isPending ? "Encerrando..." : "Encerrar chamado"}
      </Button>
    </div>
  );
}

function TicketView({ detail }: { detail: TicketDetail }) {
  const closeTicket = useCloseTicket(detail.ticket.id);
  const composer = useRef<ReplyComposerHandle>(null);
  const { ticket, messages } = detail;
  const isClosed = ticket.status === "closed";
  const promptOn = lastSupportAnswerId(detail);

  function footerFor(message: ThreadMessage) {
    if (message.id !== promptOn) {
      return null;
    }
    return (
      <ResolvedPrompt
        isClosing={closeTicket.isPending}
        onSolved={() => closeTicket.mutate()}
        onNotSolved={() => composer.current?.startWith("Ainda não resolveu")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit print:hidden">
        <Link to="/suporte">
          <ArrowLeftIcon aria-hidden="true" />
          Suporte
        </Link>
      </Button>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <TicketHeader detail={detail} />
          <TicketThread
            messages={messages}
            events={detail.events}
            seenAt={detail.seenByOtherSideAt}
            messageFooter={footerFor}
          />
          <TicketRating ticket={ticket} />
          <TicketComposer ticket={ticket} composerRef={composer} />
          {isClosed ? null : <CloseTicketBar closeTicket={closeTicket} />}
        </div>
        <TicketContextPanel ticket={ticket} orders={detail.orders} followers={detail.followers} />
      </div>
    </div>
  );
}
