import type { LinkedOrder, TicketFollower } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import type { TicketPriority, TicketStatus } from "@sellbridge/shared/schemas";
import {
  autoCloseAt,
  responseTiming,
  responseWindowUsed,
  ticketCode,
} from "@sellbridge/shared/ticket-rules";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellSlashIcon, ClockIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { SmartDate } from "@/components/data/smart-date";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { CopyButton } from "@/components/integrations/copy-button";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { OrderLinkPicker } from "@/components/support/order-link-picker";
import { Button } from "@/components/ui/button";
import { formatDeadline } from "@/features/support/response-time";
import { unlinkMyTicketOrder } from "@/features/support/support.functions";
import { displayStoreName } from "@/features/stores/store-name";
import { useNow } from "@/hooks/use-now";
import { errorMessage } from "@/lib/errors";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface PanelTicket {
  id: string;
  status: TicketStatus;
  priority: TicketPriority;
  awaitingSince: Date | null;
  assigneeName: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

function Assignee({ name }: { name: string | null }) {
  if (name === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Na fila da equipe: a primeira pessoa livre assume.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">Cuidando do seu chamado</p>
      </div>
    </div>
  );
}

/** How much of the response window is gone, and when the answer is due. */
function ResponseProgress({ ticket }: { ticket: PanelTicket }) {
  const now = useNow();
  const timing = responseTiming(ticket.awaitingSince, ticket.priority, now);
  if (timing.state === "none" || ticket.awaitingSince === null) {
    return null;
  }
  const used = responseWindowUsed(ticket.awaitingSince, ticket.priority, now);
  const label =
    timing.state === "overdue"
      ? "A resposta está a caminho: a equipe já está cuidando."
      : `Resposta prevista até ${formatDeadline(timing.dueAt, now)}`;
  return (
    <div className="space-y-1.5" suppressHydrationWarning>
      <p className="text-xs text-muted-foreground">Próxima resposta do suporte</p>
      {/* The sentence below says the same in words; the bar is only a glance. */}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none",
            timing.state === "overdue" && TONE_DOT_CLASSES.warning,
          )}
          style={{ width: `${Math.max(4, Math.round(used * 100))}%` }}
        />
      </div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** The auto-close job will close an answered ticket the reseller leaves alone. */
function AutoCloseNotice({ ticket }: { ticket: PanelTicket }) {
  const now = useNow();
  const closesAt = autoCloseAt(ticket.status, ticket.awaitingSince, ticket.updatedAt);
  if (closesAt === null) {
    return null;
  }
  return (
    <p
      className="flex gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
      suppressHydrationWarning
    >
      <ClockIcon className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
      <span>
        Sem retorno seu, este chamado é encerrado automaticamente {formatDeadline(closesAt, now)}.
      </span>
    </p>
  );
}

function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LinkedOrderItem({
  order,
  onUnlink,
}: {
  order: LinkedOrder;
  onUnlink?: (() => void) | undefined;
}) {
  return (
    <li className="space-y-1 rounded-2xl border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">#{order.externalOrderId}</span>
        <div className="flex shrink-0 items-center gap-1">
          <OrderStatusBadge status={order.status} />
          {onUnlink ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 text-muted-foreground print:hidden"
              aria-label={`Desvincular o pedido ${order.externalOrderId}`}
              onClick={onUnlink}
            >
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {displayStoreName(order.storeName)} · {formatCents(order.totalCents)}
      </p>
      <p className="text-xs text-muted-foreground">
        Vendido <SmartDate date={order.orderedAt} />
        {order.buyerName ? ` para ${order.buyerName}` : ""}
      </p>
    </li>
  );
}

function LinkedOrderList({
  orders,
  onUnlink,
}: {
  orders: readonly LinkedOrder[];
  onUnlink?: ((order: LinkedOrder) => void) | undefined;
}) {
  return (
    <ul className="space-y-2">
      {orders.map((order) => (
        <LinkedOrderItem
          key={order.orderId}
          order={order}
          onUnlink={onUnlink ? () => onUnlink(order) : undefined}
        />
      ))}
    </ul>
  );
}

/** The reseller's orders pinned to the ticket, with link and unlink. */
function LinkedOrders({ ticketId, orders }: { ticketId: string; orders: readonly LinkedOrder[] }) {
  const queryClient = useQueryClient();
  const unlink = useMutation({
    mutationFn: (order: LinkedOrder) =>
      unlinkMyTicketOrder({ data: { ticketId, orderId: order.orderId } }),
    onSuccess: async (_result, order) => {
      toast.success(`Pedido #${order.externalOrderId} desvinculado`);
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const picker = (
    <OrderLinkPicker
      ticketId={ticketId}
      align="end"
      trigger={
        <Button type="button" variant="ghost" size="sm" className="-mr-2 h-7 print:hidden">
          <PlusIcon aria-hidden="true" />
          Vincular
        </Button>
      }
    />
  );
  return (
    <PanelSection title="Pedidos vinculados" action={picker}>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Vincule o pedido de que você está falando: o suporte vê os detalhes na hora.
        </p>
      ) : (
        <LinkedOrderList orders={orders} onUnlink={(order) => unlink.mutate(order)} />
      )}
    </PanelSection>
  );
}

/** For the support team: the orders the reseller linked, read-only; nothing when none. */
export function LinkedOrdersCard({ orders }: { orders: readonly LinkedOrder[] }) {
  if (orders.length === 0) {
    return null;
  }
  return (
    <section className="surface-card rounded-3xl bg-card p-5">
      <PanelSection title="Pedidos vinculados">
        <LinkedOrderList orders={orders} />
      </PanelSection>
    </section>
  );
}

function Followers({ followers }: { followers: readonly TicketFollower[] }) {
  return (
    <PanelSection title="Recebem as respostas por e-mail">
      <ul className="space-y-1.5">
        {followers.map((follower) => (
          <li key={follower.userId} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 truncate">{follower.name}</span>
            {follower.isRequester ? (
              <span className="text-xs text-muted-foreground">abriu o chamado</span>
            ) : null}
            {follower.notify ? null : (
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <BellSlashIcon className="size-4" aria-hidden="true" />
                desligado
              </span>
            )}
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}

function ClosedNote({ closedAt }: { closedAt: Date | null }) {
  if (closedAt === null) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      Encerrado <SmartDate date={closedAt} />. Se precisar, é só responder que ele reabre.
    </p>
  );
}

/** Everything about the ticket besides the conversation, beside it on wide screens. */
export function TicketContextPanel({
  ticket,
  orders,
  followers,
}: {
  ticket: PanelTicket;
  orders: readonly LinkedOrder[];
  followers: readonly TicketFollower[];
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Sobre o chamado">
      <div className="surface-card space-y-4 rounded-3xl bg-card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs text-muted-foreground">Chamado</h2>
          <CopyButton
            value={`#${ticketCode(ticket.id)}`}
            label={`Copiar número do chamado ${ticketCode(ticket.id)}`}
          >
            #{ticketCode(ticket.id)}
          </CopyButton>
        </div>
        <Assignee name={ticket.assigneeName} />
        <ResponseProgress ticket={ticket} />
        {ticket.status === "closed" ? <ClosedNote closedAt={ticket.closedAt} /> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t pt-3 text-sm">
          <dt className="text-muted-foreground">Aberto</dt>
          <dd className="text-right">
            <SmartDate date={ticket.createdAt} />
          </dd>
          <dt className="text-muted-foreground">Última atividade</dt>
          <dd className="text-right">
            <SmartDate date={ticket.updatedAt} />
          </dd>
        </dl>
      </div>
      <AutoCloseNotice ticket={ticket} />
      <div className="surface-card space-y-5 rounded-3xl bg-card p-5">
        <LinkedOrders ticketId={ticket.id} orders={orders} />
        <Followers followers={followers} />
      </div>
    </aside>
  );
}
