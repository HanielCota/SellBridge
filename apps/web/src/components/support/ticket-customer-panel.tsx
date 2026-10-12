import type { TicketSummary, TicketThread } from "@sellbridge/database/repositories";
import { CopyIcon, IdentificationCardIcon, SignInIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { SmartDate } from "@/components/data/smart-date";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useImpersonate } from "@/features/admin/use-impersonate";

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words.at(0)?.at(0) ?? "";
  const last = words.length > 1 ? (words.at(-1)?.at(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("E-mail copiado");
  } catch {
    toast.error("Não foi possível copiar");
  }
}

function PanelAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Opening the customer file and signing in as them are admin tools. */
function AccountShortcuts({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { impersonate, pendingUserId } = useImpersonate();
  return (
    <>
      <PanelAction label="Ver ficha do cliente">
        <Button asChild variant="outline" size="icon-sm" aria-label="Ver ficha do cliente">
          <Link to="/admin/clientes/$userId" params={{ userId }}>
            <IdentificationCardIcon aria-hidden="true" />
          </Link>
        </Button>
      </PanelAction>
      {isSelf ? null : (
        <PanelAction label="Entrar como cliente para fazer o ajuste na conta">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Entrar como cliente"
            disabled={pendingUserId !== null}
            onClick={() => void impersonate(userId)}
          >
            <SignInIcon aria-hidden="true" />
          </Button>
        </PanelAction>
      )}
    </>
  );
}

function CustomerActions({
  userId,
  email,
  isSelf,
  canManageCustomers,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
  canManageCustomers: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      {canManageCustomers ? <AccountShortcuts userId={userId} isSelf={isSelf} /> : null}
      <PanelAction label="Copiar e-mail">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Copiar e-mail do cliente"
          onClick={() => void copyToClipboard(email)}
        >
          <CopyIcon aria-hidden="true" />
        </Button>
      </PanelAction>
    </div>
  );
}

function CustomerCard({
  ticket,
  isSelf,
  canManageCustomers,
}: {
  ticket: TicketThread["ticket"];
  isSelf: boolean;
  canManageCustomers: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary"
          aria-hidden="true"
        >
          {initials(ticket.createdByName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{ticket.createdByName}</p>
          <p className="truncate text-xs text-muted-foreground">{ticket.tenantName}</p>
        </div>
      </div>
      <p className="truncate text-sm text-muted-foreground">{ticket.createdByEmail}</p>
      <CustomerActions
        userId={ticket.createdById}
        email={ticket.createdByEmail}
        isSelf={isSelf}
        canManageCustomers={canManageCustomers}
      />
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
  isSelf,
  canManageCustomers,
}: {
  ticket: TicketThread["ticket"];
  relatedTickets: readonly TicketSummary[];
  relatedTotal: number;
  isSelf: boolean;
  canManageCustomers: boolean;
}) {
  return (
    <aside
      className="surface-card space-y-5 rounded-3xl bg-card p-5"
      aria-label="Contexto do cliente"
    >
      <CustomerCard ticket={ticket} isSelf={isSelf} canManageCustomers={canManageCustomers} />
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
