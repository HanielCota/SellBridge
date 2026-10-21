import type { LinkedOrder, TicketFollower } from "@sellbridge/database/repositories";
import { customerTicketTitle } from "@sellbridge/shared/support-topics";
import { ticketCode } from "@sellbridge/shared/ticket-rules";
import type { ReactNode } from "react";
import { TONE_DOT_CLASSES, type StatusTone } from "@/components/data/tone-status";
import { OrderLinkPicker } from "@/components/support/order-link-picker";
import { TicketActionsMenu } from "@/components/support/ticket-actions-menu";
import type { TicketSubjectLabels } from "@/components/support/ticket-subject";
import { Button } from "@/components/ui/button";
import {
  customerTicketState,
  type CustomerTicketFacts,
  type CustomerTicketTone,
} from "@/features/support/customer-ticket-state";
import { displayStoreName } from "@/features/stores/store-name";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

const DOT_TONES: Record<CustomerTicketTone, StatusTone> = {
  waiting: "warning",
  late: "warning",
  answered: "success",
  closed: "muted",
};

type HeaderTicket = Parameters<typeof TicketActionsMenu>[0]["ticket"];

/** Where the ticket is and what happens next, in one line under the title. */
function TicketStateLine({ facts }: { facts: CustomerTicketFacts }) {
  const now = useNow();
  const state = customerTicketState(facts, now);
  return (
    <p className="flex items-start gap-2.5 text-[0.9375rem]">
      <span
        className={cn("mt-2 size-2 shrink-0 rounded-full", TONE_DOT_CLASSES[DOT_TONES[state.tone]])}
        aria-hidden="true"
      />
      <span>
        <span className="font-semibold">{state.headline}.</span>{" "}
        <span className="text-muted-foreground">{state.detail}</span>
      </span>
    </p>
  );
}

/** "Pedido #123 · Loja Centro": what the ticket is about, from the form and the linked orders. */
function aboutLabels(subject: TicketSubjectLabels, orders: readonly LinkedOrder[]): string[] {
  const orderIds = new Set(orders.map((order) => order.externalOrderId));
  if (subject.order) {
    orderIds.add(subject.order.externalOrderId);
  }
  const labels = [...orderIds].map((id) => `Pedido #${id}`);
  if (subject.store) {
    labels.push(displayStoreName(subject.store.name));
  }
  if (subject.listing) {
    labels.push(subject.listing.title);
  }
  return labels;
}

/**
 * An order ticket without an order makes support ask "qual pedido?" before anything else, so the
 * page asks first. Other topics only show what is already attached.
 */
function TicketAboutLine({
  ticketId,
  isOrderTopic,
  subject,
  orders,
}: {
  ticketId: string;
  isOrderTopic: boolean;
  subject: TicketSubjectLabels;
  orders: readonly LinkedOrder[];
}) {
  const labels = aboutLabels(subject, orders);
  if (labels.length > 0) {
    return <p className="truncate text-sm text-muted-foreground">{labels.join(" · ")}</p>;
  }
  if (!isOrderTopic) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        Qual pedido? Com ele o suporte responde mais rápido.
      </span>
      <OrderLinkPicker
        ticketId={ticketId}
        trigger={
          <Button type="button" variant="outline" size="sm">
            Escolher pedido
          </Button>
        }
      />
    </div>
  );
}

export function CustomerTicketHeader({
  ticket,
  facts,
  subject,
  orders,
  followers,
  notifyMe,
  linksOrders,
}: {
  ticket: HeaderTicket;
  facts: CustomerTicketFacts;
  subject: TicketSubjectLabels;
  orders: readonly LinkedOrder[];
  followers: readonly TicketFollower[];
  notifyMe: boolean;
  /** Off for suppliers: their account has no store orders to pick from. */
  linksOrders: boolean;
}): ReactNode {
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance">
          {customerTicketTitle(ticket.subject)}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums select-all">
            Nº {ticketCode(ticket.id)}
          </span>
          <TicketActionsMenu ticket={ticket} followers={followers} notifyMe={notifyMe} />
        </div>
      </div>
      <TicketStateLine facts={facts} />
      <TicketAboutLine
        ticketId={ticket.id}
        isOrderTopic={linksOrders && ticket.category === "order"}
        subject={subject}
        orders={orders}
      />
    </header>
  );
}
