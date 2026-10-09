import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { TicketStatusBadge } from "@/components/data/ticket-status-badge";
import { ErrorState } from "@/components/feedback/error-state";
import { ReplyForm } from "@/components/support/reply-form";
import { TicketThread } from "@/components/support/ticket-thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminSetTicketStatus } from "@/features/support/support.functions";
import { adminTicketQueryOptions } from "@/features/support/support.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/chamados/$ticketId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, adminTicketQueryOptions(params.ticketId)),
  head: () => ({ meta: [{ title: "Chamado (admin) | SellBridge" }] }),
  component: AdminTicketPage,
});

function AdminTicketPage() {
  const { ticketId } = Route.useParams();
  const queryClient = useQueryClient();
  const query = useQuery(adminTicketQueryOptions(ticketId));
  const statusMutation = useMutation({
    mutationFn: (status: "open" | "closed") => adminSetTicketStatus({ data: { ticketId, status } }),
    onSuccess: async (_result, status) => {
      toast.success(status === "closed" ? "Chamado encerrado" : "Chamado reaberto");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isPending) {
    return <Skeleton className="h-96 rounded-xl" aria-label="Carregando chamado" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { ticket, messages } = query.data;
  const isClosed = ticket.status === "closed";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/admin/chamados">
          <ArrowLeft aria-hidden="true" />
          Chamados
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {ticket.tenantName} · {ticket.createdByEmail}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={statusMutation.isPending}
          onClick={() => statusMutation.mutate(isClosed ? "open" : "closed")}
        >
          {isClosed ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {isClosed ? "Reabrir chamado" : "Encerrar chamado"}
        </Button>
      </div>
      <TicketThread messages={messages} />
      {isClosed ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Chamado encerrado. Reabra para responder.
        </p>
      ) : (
        <ReplyForm
          endpoint={`/api/admin/chamados/${ticket.id}/mensagens`}
          label="Resposta do suporte"
          onSent={async () => {
            toast.success("Resposta enviada ao revendedor");
            await queryClient.invalidateQueries({ queryKey: ["tickets"] });
          }}
        />
      )}
    </div>
  );
}
