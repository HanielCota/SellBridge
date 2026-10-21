import type { TicketSummary } from "@sellbridge/database/repositories";
import { CaretRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { SmartDate } from "@/components/data/smart-date";
import { UnreadDot } from "@/components/support/ticket-badges";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { CUSTOMER_TICKET_STATUS_LABELS } from "@/features/support/customer-ticket-state";
import { Skeleton } from "@/components/ui/skeleton";
import { mySupportOverviewQueryOptions } from "@/features/support/support.queries";

function RecentTicket({ ticket, onNavigate }: { ticket: TicketSummary; onNavigate: () => void }) {
  return (
    <li>
      <Link
        to="/suporte/$ticketId"
        params={{ ticketId: ticket.id }}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="line-clamp-1 text-sm font-medium">{ticket.subject}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {ticket.hasUnread ? (
              <UnreadDot />
            ) : (
              <TicketStatusBadge status={ticket.status} labels={CUSTOMER_TICKET_STATUS_LABELS} />
            )}
            <span aria-hidden="true">·</span>
            <SmartDate date={ticket.updatedAt} />
          </span>
        </span>
        <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Loaded only while the chat is open: the launcher badge comes from the attention counts. */
export function RecentTickets({ onNavigate }: { onNavigate: () => void }) {
  const query = useQuery(mySupportOverviewQueryOptions());
  if (query.isPending) {
    return <Skeleton className="mx-1 h-24 rounded-xl" aria-label="Carregando chamados" />;
  }
  if (query.isError || query.data.recent.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <h3 className="px-2.5 pt-1 text-xs font-medium text-muted-foreground">Seus chamados</h3>
      <ul>
        {query.data.recent.map((ticket) => (
          <RecentTicket key={ticket.id} ticket={ticket} onNavigate={onNavigate} />
        ))}
      </ul>
      <Link
        to="/suporte"
        onClick={onNavigate}
        className="block rounded-xl px-2.5 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        {query.data.total > query.data.recent.length
          ? `Ver todos os ${query.data.total} chamados`
          : "Ver todos os chamados"}
      </Link>
    </div>
  );
}
