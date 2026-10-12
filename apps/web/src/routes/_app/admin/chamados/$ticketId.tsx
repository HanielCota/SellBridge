import type { TicketStatus } from "@sellbridge/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { toast } from "sonner";
import { SmartDate } from "@/components/data/smart-date";
import {
  ResponseDeadlineBadge,
  TicketCategoryLabel,
  TicketPriorityBadge,
} from "@/components/support/ticket-badges";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { TicketHistory, TicketTriagePanel } from "@/components/support/ticket-triage-panel";
import { ErrorState } from "@/components/feedback/error-state";
import {
  AdminComposer,
  type ComposerHandle,
  type ComposerMode,
} from "@/components/support/admin-composer";
import { TicketCustomerPanel } from "@/components/support/ticket-customer-panel";
import { TicketThread } from "@/components/support/ticket-thread";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type staffGetTicket,
  staffMarkTicketRead,
  staffSetTicketStatus,
} from "@/features/support/support.functions";
import { firstName, quoteMessage } from "@/features/support/reply-templates";
import { staffTicketQueryOptions } from "@/features/support/support.queries";
import { useMarkTicketRead } from "@/features/support/use-mark-ticket-read";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

type AdminTicketDetail = Awaited<ReturnType<typeof staffGetTicket>>;
type AdminTicket = AdminTicketDetail["ticket"];

export const Route = createFileRoute("/_app/admin/chamados/$ticketId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, staffTicketQueryOptions(params.ticketId)),
  head: () => ({ meta: [{ title: "Chamado (equipe) | SellBridge" }] }),
  component: AdminTicketPage,
});

function useTicketStatusMutation(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: "open" | "closed") => staffSetTicketStatus({ data: { ticketId, status } }),
    onSuccess: async (_result, status) => {
      toast.success(status === "closed" ? "Chamado encerrado" : "Chamado reaberto");
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function sentMessage(mode: ComposerMode, status: TicketStatus): string {
  if (mode === "note") {
    return "Nota interna salva";
  }
  if (status === "closed") {
    return "Resposta enviada e chamado encerrado";
  }
  if (status === "open") {
    return "Resposta enviada; o chamado segue aguardando o suporte";
  }
  return "Resposta enviada ao revendedor";
}

function AdminTicketPage() {
  const { ticketId } = Route.useParams();
  const query = useQuery(staffTicketQueryOptions(ticketId));
  useMarkTicketRead(ticketId, query.data?.messages.at(-1)?.id, staffMarkTicketRead);

  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando chamado" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <AdminTicketWorkspace detail={query.data} />;
}

function AdminTicketWorkspace({ detail }: { detail: AdminTicketDetail }) {
  const { session } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const statusMutation = useTicketStatusMutation(detail.ticket.id);
  const composerRef = useRef<ComposerHandle>(null);
  const { ticket, messages } = detail;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link to="/admin/chamados">
          <ArrowLeftIcon aria-hidden="true" />
          Chamados
        </Link>
      </Button>
      <AdminTicketHeader ticket={ticket} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <TicketThread
            messages={messages}
            onQuote={(message) =>
              composerRef.current?.insert(quoteMessage(message.authorName, message.body))
            }
          />
          <AdminComposer
            ref={composerRef}
            ticketId={ticket.id}
            isClosed={ticket.status === "closed"}
            templateContext={{
              customerName: firstName(ticket.createdByName),
              storeName: ticket.tenantName,
              subject: ticket.subject,
              agentName: session.user.name,
            }}
            isChangingStatus={statusMutation.isPending}
            onChangeStatus={(status) => statusMutation.mutate(status)}
            onSent={async (mode, status) => {
              toast.success(sentMessage(mode, status));
              await queryClient.invalidateQueries({ queryKey: ["tickets"] });
            }}
          />
        </div>
        <div className="space-y-4">
          <TicketTriagePanel
            ticket={ticket}
            viewer={{ userId: session.user.id, role: session.user.role }}
          />
          <TicketCustomerPanel
            ticket={ticket}
            relatedTickets={detail.relatedTickets}
            relatedTotal={detail.relatedTotal}
            isSelf={ticket.createdById === session.user.id}
            canManageCustomers={hasStaffPermission(session.user.role, "customers.manage")}
          />
          <TicketHistory events={detail.events} />
        </div>
      </div>
    </div>
  );
}

function AdminTicketHeader({ ticket }: { readonly ticket: AdminTicket }) {
  return (
    <header className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <ResponseDeadlineBadge
          status={ticket.status}
          priority={ticket.priority}
          awaitingSince={ticket.awaitingSince}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {ticket.tenantName} · <TicketCategoryLabel category={ticket.category} /> · aberto{" "}
        <SmartDate date={ticket.createdAt} />
      </p>
    </header>
  );
}
