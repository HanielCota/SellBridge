import type { TicketStatus } from "@sellbridge/shared/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/page-header";
import { createFileRoute } from "@tanstack/react-router";

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
import { LinkedOrdersCard } from "@/components/support/linked-orders-card";
import { TicketThread } from "@/components/support/ticket-thread";

import { Skeleton } from "@/components/ui/skeleton";
import {
  type staffGetTicket,
  staffMarkTicketRead,
  staffSetTicketStatus,
} from "@/features/support/support.functions";
import { firstName, quoteMessage } from "@/features/support/reply-templates";
import { REQUESTER_KIND_LABELS, replyTemplatesFor } from "@/features/support/ticket-audience";
import { staffTicketQueryOptions } from "@/features/support/support.queries";
import { messageToMarkRead, useMarkTicketRead } from "@/features/support/use-mark-ticket-read";
import { NOT_SOLVED_MESSAGE } from "@/features/support/use-ticket-verdict";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { customerTicketTitle } from "@sellbridge/shared/support-topics";
import { AUTO_CLOSE_AFTER_DAYS, ticketCode } from "@sellbridge/shared/ticket-rules";
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

/** Only the team's ticket queries change; the customer-side lists stay cached. */
const STAFF_TICKETS_KEY = ["tickets", "admin"] as const;

/**
 * "Encerrar sem responder" sits one click away in the send menu, so a close comes with
 * "Reabrir" on its notice instead of a confirmation dialog.
 */
function useTicketStatusMutation(ticketId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: "open" | "closed") => staffSetTicketStatus({ data: { ticketId, status } }),
    onSuccess: async (_result, status) => {
      if (status === "closed") {
        toast.success("Chamado encerrado", {
          action: { label: "Reabrir", onClick: () => mutation.mutate("open") },
        });
      }
      if (status === "open") {
        toast.success("Chamado reaberto");
      }
      await queryClient.invalidateQueries({ queryKey: STAFF_TICKETS_KEY });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return mutation;
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
  return `Resposta enviada. Sem retorno do cliente em ${AUTO_CLOSE_AFTER_DAYS} dias, o chamado encerra sozinho.`;
}

/**
 * The customer pressed "Não" under the last answer: the ticket is back in the queue with a
 * one-line message, and the agent needs to know their answer did not solve it.
 */
function reopenedByVerdict(detail: AdminTicketDetail): boolean {
  const last = detail.messages.at(-1);
  if (last === undefined || last.isAdmin) {
    return false;
  }
  return detail.ticket.status === "open" && last.body === NOT_SOLVED_MESSAGE;
}

function NotSolvedBanner() {
  return (
    <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <span className="font-medium">O cliente disse que a resposta não resolveu.</span>{" "}
      <span className="text-muted-foreground">Releia o caso e responda com o próximo passo.</span>
    </p>
  );
}

function AdminTicketPage() {
  const { ticketId } = Route.useParams();
  const query = useQuery(staffTicketQueryOptions(ticketId));
  const { session } = Route.useRouteContext();
  useMarkTicketRead(
    ticketId,
    messageToMarkRead(query.data?.messages ?? [], session.user.id),
    staffMarkTicketRead,
  );

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
      <BackLink to="/admin/chamados" label="Chamados" />
      <AdminTicketHeader ticket={ticket} />
      {reopenedByVerdict(detail) ? <NotSolvedBanner /> : null}
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
            templates={replyTemplatesFor(ticket.tenantKind)}
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
              await queryClient.invalidateQueries({ queryKey: STAFF_TICKETS_KEY });
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
            access={{
              isSelf: ticket.createdById === session.user.id,
              canManageCustomers: hasStaffPermission(session.user.role, "customers.manage"),
              canImpersonate: hasStaffPermission(session.user.role, "customers.impersonate"),
            }}
          />
          <LinkedOrdersCard orders={detail.orders} subject={detail.subject} />
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
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          {customerTicketTitle(ticket.subject)}
        </h1>
        <TicketStatusBadge status={ticket.status} />
        <TicketPriorityBadge priority={ticket.priority} />
        <ResponseDeadlineBadge
          status={ticket.status}
          priority={ticket.priority}
          awaitingSince={ticket.awaitingSince}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-mono">#{ticketCode(ticket.id)}</span> ·{" "}
        {REQUESTER_KIND_LABELS[ticket.tenantKind]} · {ticket.tenantName} ·{" "}
        <TicketCategoryLabel category={ticket.category} kind={ticket.tenantKind} /> · aberto{" "}
        <SmartDate date={ticket.createdAt} />
      </p>
    </header>
  );
}
