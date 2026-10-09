import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { TicketStatusBadge } from "@/components/data/ticket-status-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { ReplyForm } from "@/components/support/reply-form";
import { TicketThread } from "@/components/support/ticket-thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { myTicketQueryOptions } from "@/features/support/support.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/suporte/$ticketId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, myTicketQueryOptions(params.ticketId)),
  head: () => ({ meta: [{ title: "Chamado | SellBridge" }] }),
  component: TicketPage,
});

function TicketPage() {
  const { ticketId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = useQuery(myTicketQueryOptions(ticketId));

  if (query.isPending) {
    return <Skeleton className="h-96 rounded-xl" aria-label="Carregando chamado" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { ticket, messages } = query.data;
  return (
    <div className="w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/suporte">
          <ArrowLeftIcon aria-hidden="true" />
          Suporte
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{ticket.subject}</h1>
        <TicketStatusBadge status={ticket.status} />
      </div>
      <TicketThread messages={messages} />
      <ReplyForm
        endpoint={`/api/suporte/chamados/${ticket.id}/mensagens`}
        label={ticket.status === "closed" ? "Responder reabre o chamado" : "Sua resposta"}
        onSent={async () => {
          toast.success("Resposta enviada");
          await queryClient.invalidateQueries({ queryKey: ["tickets"] });
        }}
      />
    </div>
  );
}
