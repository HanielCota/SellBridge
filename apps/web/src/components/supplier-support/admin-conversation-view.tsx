import {
  CONVERSATION_STATUS_LABELS,
  SUPPLIER_CONVERSATION_TOPIC_LABELS,
} from "@sellbridge/shared/supplier-conversation-topics";
import { ticketCode } from "@sellbridge/shared/ticket-rules";
import { EyeIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { SmartDate } from "@/components/data/smart-date";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink } from "@/components/layout/page-header";
import { TEAM_CONVERSATION } from "@/components/supplier-support/conversation-perspective";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { TicketThread } from "@/components/support/ticket-thread";
import { Skeleton } from "@/components/ui/skeleton";
import { displayStoreName } from "@/features/stores/store-name";
import type { ConversationView } from "@/features/supplier-support/conversation-thread";
import { staffConversationQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { errorMessage } from "@/lib/errors";

function ReadOnlyNotice() {
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border border-dashed px-4 py-3 text-sm">
      <EyeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        <span className="font-medium">Conversa entre revendedor e fornecedor.</span>{" "}
        <span className="text-muted-foreground">
          A equipe acompanha para evitar negociações fora do SellBridge. Quem responde é o
          fornecedor.
        </span>
      </span>
    </p>
  );
}

function ConversationTitle({ view }: { view: ConversationView }) {
  const { conversation } = view;
  const topic =
    conversation.topic === null ? null : SUPPLIER_CONVERSATION_TOPIC_LABELS[conversation.topic];
  const orders = view.orders.map((order) => `Pedido #${order.externalOrderId}`);
  return (
    <header className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
          {conversation.subject}
        </h1>
        <TicketStatusBadge
          status={conversation.status}
          labels={CONVERSATION_STATUS_LABELS.reseller}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-mono">#{ticketCode(conversation.id)}</span> ·{" "}
        {conversation.resellerName} ({displayStoreName(conversation.storeName)}) →{" "}
        {conversation.supplierName}
        {topic === null ? null : ` · ${topic}`}
        {orders.length > 0 ? ` · ${orders.join(", ")}` : null} · aberta{" "}
        <SmartDate date={conversation.createdAt} />
      </p>
    </header>
  );
}

/** What the team sees of a reseller ↔ supplier conversation: everything, and no reply box. */
export function AdminConversationView({ ticketId }: { ticketId: string }) {
  const query = useQuery(staffConversationQueryOptions(ticketId));
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando conversa" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <BackLink to="/admin/chamados" label="Chamados" />
      <ConversationTitle view={query.data} />
      <ReadOnlyNotice />
      <TicketThread
        messages={query.data.messages}
        events={query.data.events}
        perspective={TEAM_CONVERSATION}
      />
    </div>
  );
}
