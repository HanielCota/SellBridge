import type { TicketSummary, TicketThread } from "@sellbridge/database/repositories";
import { CopyIcon, IdentificationCardIcon, SignInIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useImpersonate } from "@/features/admin/use-impersonate";
import { enterAccountAction, type EnterAccountAction } from "@/features/support/enter-account";
import { copyToClipboard } from "@/lib/clipboard";
import { UserAvatar } from "@/components/layout/user-avatar";

function PanelAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The customer file is an admin page; agents and supervisors do not see the shortcut. */
function CustomerFileLink({ userId }: { userId: string }) {
  return (
    <PanelAction label="Ver ficha do cliente">
      <Button asChild variant="outline" size="icon-sm" aria-label="Ver ficha do cliente">
        <Link to="/admin/clientes/$userId" params={{ userId }}>
          <IdentificationCardIcon aria-hidden="true" />
        </Link>
      </Button>
    </PanelAction>
  );
}

function EnterAccountButton({ userId, action }: { userId: string; action: EnterAccountAction }) {
  const { impersonate, pendingUserId } = useImpersonate();
  return (
    <PanelAction label={action.hint}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={action.label}
        disabled={pendingUserId !== null}
        onClick={() => void impersonate(userId, action.path)}
      >
        <SignInIcon aria-hidden="true" />
      </Button>
    </PanelAction>
  );
}

export interface CustomerAccess {
  isSelf: boolean;
  canManageCustomers: boolean;
  canImpersonate: boolean;
}

function CustomerActions({
  ticket,
  access,
}: {
  ticket: TicketThread["ticket"];
  access: CustomerAccess;
}) {
  const enterAccount = enterAccountAction({
    tenantKind: ticket.tenantKind,
    ticketStatus: ticket.status,
    ...access,
  });
  return (
    <div className="flex gap-1.5">
      {access.canManageCustomers ? <CustomerFileLink userId={ticket.createdById} /> : null}
      {enterAccount === null ? null : (
        <EnterAccountButton userId={ticket.createdById} action={enterAccount} />
      )}
      <PanelAction label="Copiar e-mail">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Copiar e-mail do cliente"
          onClick={() => void copyToClipboard(ticket.createdByEmail, "E-mail copiado")}
        >
          <CopyIcon aria-hidden="true" />
        </Button>
      </PanelAction>
    </div>
  );
}

function CustomerCard({
  ticket,
  access,
}: {
  ticket: TicketThread["ticket"];
  access: CustomerAccess;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar
          name={ticket.createdByName}
          image={ticket.createdByImage}
          className="size-10 text-sm"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{ticket.createdByName}</p>
          <p className="truncate text-xs text-muted-foreground">{ticket.tenantName}</p>
        </div>
      </div>
      <p className="truncate text-sm text-muted-foreground">{ticket.createdByEmail}</p>
      <CustomerActions ticket={ticket} access={access} />
    </div>
  );
}

function RelatedTickets({
  tenantName,
  tickets,
  total,
}: {
  tenantName: string;
  tickets: readonly TicketSummary[];
  total: number;
}) {
  if (tickets.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum outro chamado da loja.</p>;
  }
  return (
    <div className="space-y-2">
      <h2 className="text-xs text-muted-foreground">Outros chamados · {total}</h2>
      <ul className="-mx-2">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <Link
              to="/admin/chamados/$ticketId"
              params={{ ticketId: ticket.id }}
              className="block space-y-0.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
            >
              <span className="line-clamp-1 text-sm">{ticket.subject}</span>
              <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <TicketStatusBadge status={ticket.status} />
                <SmartDate date={ticket.updatedAt} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {total > tickets.length ? (
        <Link
          to="/admin/chamados"
          search={{ query: tenantName }}
          className="inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          Ver todos
        </Link>
      ) : null}
    </div>
  );
}

/** Who opened the ticket, shortcuts to act on their account and the store's ticket history. */
export function TicketCustomerPanel({
  ticket,
  relatedTickets,
  relatedTotal,
  access,
}: {
  ticket: TicketThread["ticket"];
  relatedTickets: readonly TicketSummary[];
  relatedTotal: number;
  access: CustomerAccess;
}) {
  return (
    <aside
      className="surface-card space-y-5 rounded-3xl bg-card p-5"
      aria-label="Contexto do cliente"
    >
      <CustomerCard ticket={ticket} access={access} />
      <div className="border-t pt-4">
        <RelatedTickets
          tenantName={ticket.tenantName}
          tickets={relatedTickets}
          total={relatedTotal}
        />
      </div>
    </aside>
  );
}
