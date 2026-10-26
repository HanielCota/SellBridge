import type { LinkedOrder } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import type { ReactNode } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import {
  hasTicketSubject,
  TicketSubjectList,
  type TicketSubjectLabels,
} from "@/components/support/ticket-subject";

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

function LinkedOrderItem({ order }: { order: LinkedOrder }) {
  return (
    <li className="space-y-1 rounded-2xl border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">#{order.externalOrderId}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {order.storeName} · {formatCents(order.totalCents)}
      </p>
      <p className="text-xs text-muted-foreground">
        Vendido <SmartDate date={order.orderedAt} />
        {order.buyerName ? ` para ${order.buyerName}` : ""}
      </p>
    </li>
  );
}

function LinkedOrderList({ orders }: { orders: readonly LinkedOrder[] }) {
  return (
    <ul className="space-y-2">
      {orders.map((order) => (
        <LinkedOrderItem key={order.orderId} order={order} />
      ))}
    </ul>
  );
}

/**
 * For the support team: the store and listing the ticket is about and the orders the reseller
 * linked, read-only; nothing when there is none.
 */
export function LinkedOrdersCard({
  orders,
  subject,
}: {
  orders: readonly LinkedOrder[];
  subject: TicketSubjectLabels;
}) {
  if (orders.length === 0 && !hasTicketSubject(subject)) {
    return null;
  }
  return (
    <section className="surface-card space-y-5 rounded-3xl bg-card p-5">
      {hasTicketSubject(subject) ? (
        <PanelSection title="Sobre">
          <TicketSubjectList subject={subject} />
        </PanelSection>
      ) : null}
      {orders.length === 0 ? null : (
        <PanelSection title="Pedidos vinculados">
          <LinkedOrderList orders={orders} />
        </PanelSection>
      )}
    </section>
  );
}
