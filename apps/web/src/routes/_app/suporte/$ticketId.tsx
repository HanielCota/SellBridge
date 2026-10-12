import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/error-state";
import { ExpectedReplyText, TicketCategoryLabel } from "@/components/support/ticket-badges";
import { RatingStars, TicketRatingForm } from "@/components/support/ticket-rating";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { ReplyForm } from "@/components/support/reply-form";
import { TicketThread } from "@/components/support/ticket-thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando chamado" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <TicketView detail={query.data} />;
}

/** What comes after the thread: the reply box, or the rating once the ticket is closed. */
function TicketFooter({ ticket }: { ticket: TicketDetail["ticket"] }) {
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

function TicketView({ detail }: { detail: TicketDetail }) {
  const queryClient = useQueryClient();
  const closeTicket = useCloseTicket(detail.ticket.id);
  const { ticket, messages } = detail;
  const isClosed = ticket.status === "closed";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link to="/suporte">
          <ArrowLeftIcon aria-hidden="true" />
          Suporte
        </Link>
      </Button>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <TicketCategoryLabel category={ticket.category} className="block" />
        <ExpectedReplyText
          status={ticket.status}
          priority={ticket.priority}
          awaitingSince={ticket.awaitingSince}
        />
      </header>
      <TicketThread messages={messages} />
      <TicketFooter ticket={ticket} />
      <ReplyForm
        endpoint={`/api/suporte/chamados/${ticket.id}/mensagens`}
        isClosed={isClosed}
        onSent={async () => {
          toast.success("Resposta enviada");
          await queryClient.invalidateQueries({ queryKey: ["tickets"] });
        }}
      />
      {isClosed ? null : (
        <div className="flex flex-col items-start gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
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
      )}
    </div>
  );
}
