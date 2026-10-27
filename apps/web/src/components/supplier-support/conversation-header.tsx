import {
  SUPPLIER_CONVERSATION_TOPIC_LABELS,
  type ConversationSide,
} from "@sellbridge/shared/supplier-conversation-topics";
import { ticketCode } from "@sellbridge/shared/ticket-rules";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { TONE_DOT_CLASSES, type StatusTone } from "@/components/data/tone-status";
import {
  conversationState,
  type ConversationTone,
} from "@/features/supplier-support/conversation-state";
import type {
  ConversationHeader as Conversation,
  ConversationOrderLink,
} from "@/features/supplier-support/conversation-thread";
import { cn } from "@/lib/utils";

const DOT_TONES: Record<ConversationTone, StatusTone> = {
  waiting: "warning",
  answered: "success",
  closed: "muted",
};

/** "Loja Centro · Calçados Franca · Pedido": who talks, and about what. */
function AboutLine({
  conversation,
  orders,
  linksOrders,
}: {
  conversation: Conversation;
  orders: readonly ConversationOrderLink[];
  linksOrders: boolean;
}) {
  const topic =
    conversation.topic === null ? null : SUPPLIER_CONVERSATION_TOPIC_LABELS[conversation.topic];
  return (
    <p className="text-sm text-muted-foreground">
      {conversation.storeName} · {conversation.supplierName}
      {topic === null ? null : ` · ${topic}`}
      {orders.map((order) => (
        <span key={order.orderId}>
          {" · "}
          {linksOrders ? (
            <Link
              to="/pedidos/$orderId"
              params={{ orderId: order.orderId }}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Pedido #{order.externalOrderId}
            </Link>
          ) : (
            `Pedido #${order.externalOrderId}`
          )}
        </span>
      ))}
    </p>
  );
}

/** Title, where the conversation stands and what it is about: the same layout as a ticket. */
export function ConversationHeader({
  conversation,
  orders,
  side,
  actions,
}: {
  conversation: Conversation;
  orders: readonly ConversationOrderLink[];
  side: ConversationSide;
  actions?: ReactNode;
}) {
  const state = conversationState(side, conversation.status);
  return (
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance">
          {conversation.subject}
        </h1>
        <span className="shrink-0 pt-1.5 text-sm text-muted-foreground tabular-nums select-all">
          Nº {ticketCode(conversation.id)}
        </span>
      </div>
      <p className="flex items-start gap-2.5 text-[0.9375rem]">
        <span
          className={cn(
            "mt-2 size-2 shrink-0 rounded-full",
            TONE_DOT_CLASSES[DOT_TONES[state.tone]],
          )}
          aria-hidden="true"
        />
        <span>
          <span className="font-semibold">{state.headline}.</span>{" "}
          <span className="text-muted-foreground">{state.detail}</span>
        </span>
      </p>
      <AboutLine conversation={conversation} orders={orders} linksOrders={side === "reseller"} />
      {actions}
    </header>
  );
}
