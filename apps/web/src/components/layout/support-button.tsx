import type { TicketSummary } from "@sellbridge/database/repositories";
import { CaretRightIcon, LifebuoyIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Popover } from "radix-ui";
import { useState } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { UnreadDot } from "@/components/support/ticket-badges";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { responseTargetText, unreadRepliesText } from "@/features/support/response-time";
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
            {ticket.hasUnread ? <UnreadDot /> : <TicketStatusBadge status={ticket.status} />}
            <span aria-hidden="true">·</span>
            <SmartDate date={ticket.updatedAt} />
          </span>
        </span>
        <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Loaded only while the panel is open: the badge count comes from the nav's attention counts. */
function RecentTickets({ onNavigate }: { onNavigate: () => void }) {
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

/**
 * Help one tap away from every page: open a ticket, or jump back into one. The badge counts
 * tickets with a support reply you have not read yet.
 */
export function SupportButton({ unread, className }: { unread: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread > 0 ? `Suporte: ${unreadRepliesText(unread)}` : "Suporte"}
        className={
          className ??
          "relative flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground transition-[color,scale] duration-150 outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100"
        }
      >
        <LifebuoyIcon className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold text-primary-foreground tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          aria-labelledby="support-panel-title"
          className="z-50 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-2xl bg-popover p-2 text-popover-foreground shadow-xl shadow-black/15 ring-1 ring-border outline-none"
        >
          <div className="space-y-3 px-2.5 pt-2 pb-1">
            <div className="space-y-0.5">
              <h2 id="support-panel-title" className="text-sm font-semibold">
                Precisa de ajuda?
              </h2>
              <p className="text-xs text-muted-foreground">
                {responseTargetText("normal")}, direto por aqui.
              </p>
            </div>
            <Button asChild size="sm" className="w-full">
              <Link to="/suporte/novo" onClick={close}>
                <PlusIcon aria-hidden="true" />
                Abrir chamado
              </Link>
            </Button>
          </div>
          <RecentTickets onNavigate={close} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
