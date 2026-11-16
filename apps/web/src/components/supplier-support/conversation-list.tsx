import type { ConversationSummary } from "@sellbridge/database/repositories";
import {
  CONVERSATION_STATUS_LABELS,
  SUPPLIER_CONVERSATION_TOPIC_LABELS,
  type ConversationSide,
} from "@sellbridge/shared/supplier-conversation-topics";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { SupplierConversationActions } from "@/components/supplier-support/supplier-conversation-actions";
import { UnreadSubject, unreadSubjectClass } from "@/components/support/ticket-badges";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { cn } from "@/lib/utils";

/** Who the conversation is with, in the reader's terms: the brand for a store, the store for a brand. */
function counterpartLine(row: ConversationSummary, side: ConversationSide): string {
  const store = row.storeName ?? "Loja";
  if (side === "reseller") {
    return `${store} · ${row.supplierName ?? "Fornecedor"}`;
  }
  return `${store} · ${row.resellerName}`;
}

function topicLabel(row: ConversationSummary): string {
  return row.topic === null ? "Conversa" : SUPPLIER_CONVERSATION_TOPIC_LABELS[row.topic];
}

/** "Cancelamento · Pedido 2000123": what it is about, with the order the supplier looks up. */
function aboutLine(row: ConversationSummary): ReactNode {
  if (row.order === null) {
    return topicLabel(row);
  }
  return (
    <>
      {topicLabel(row)} ·{" "}
      <span className="whitespace-nowrap">Pedido {row.order.externalOrderId}</span>
    </>
  );
}

const UNREAD_LABEL = "Mensagem nova";

/** The unread message has its dot beside the subject, so the status always shows here. */
function ConversationState({ row, side }: { row: ConversationSummary; side: ConversationSide }) {
  return <TicketStatusBadge status={row.status} labels={CONVERSATION_STATUS_LABELS[side]} />;
}

function ConversationSubject({ row, side }: { row: ConversationSummary; side: ConversationSide }) {
  return (
    <UnreadSubject unread={row.hasUnread} label={UNREAD_LABEL} hanging>
      <div className="space-y-0.5">
        <Link
          to="/suporte/conversas/$ticketId"
          params={{ ticketId: row.id }}
          className={cn(unreadSubjectClass(row.hasUnread), "underline-offset-4 hover:underline")}
        >
          {row.subject}
        </Link>
        <p className="text-sm text-muted-foreground">
          {counterpartLine(row, side)} · {aboutLine(row)}
        </p>
      </div>
    </UnreadSubject>
  );
}

function MobileConversationRow({
  row,
  side,
}: {
  row: ConversationSummary;
  side: ConversationSide;
}) {
  if (side === "supplier") {
    return <MobileSupplierRow row={row} />;
  }
  return (
    <Link to="/suporte/conversas/$ticketId" params={{ ticketId: row.id }} className="block">
      <UnreadSubject unread={row.hasUnread} label={UNREAD_LABEL}>
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <p className={cn("min-w-0", unreadSubjectClass(row.hasUnread))}>{row.subject}</p>
            <ConversationState row={row} side={side} />
          </div>
          <p className="text-xs text-muted-foreground">
            {counterpartLine(row, side)} · {aboutLine(row)} · <SmartDate date={row.updatedAt} />
          </p>
        </div>
      </UnreadSubject>
    </Link>
  );
}

/** The supplier acts from the card, so only the subject opens the conversation. */
function MobileSupplierRow({ row }: { row: ConversationSummary }) {
  return (
    <UnreadSubject unread={row.hasUnread} label={UNREAD_LABEL}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <Link
              to="/suporte/conversas/$ticketId"
              params={{ ticketId: row.id }}
              className={cn(
                "min-w-0 underline-offset-4 hover:underline",
                unreadSubjectClass(row.hasUnread),
              )}
            >
              {row.subject}
            </Link>
            <ConversationState row={row} side="supplier" />
          </div>
          <p className="text-xs text-muted-foreground">
            {counterpartLine(row, "supplier")} · {aboutLine(row)} ·{" "}
            <SmartDate date={row.updatedAt} />
          </p>
        </div>
        <SupplierConversationActions conversation={row} size="touch" />
      </div>
    </UnreadSubject>
  );
}

const columnHelper = createServerColumnHelper<ConversationSummary>();

const subjectColumn = (side: ConversationSide) =>
  columnHelper.accessor("subject", {
    header: "Assunto",
    cell: (info) => <ConversationSubject row={info.row.original} side={side} />,
  });

const stateColumn = (side: ConversationSide) =>
  columnHelper.accessor("status", {
    header: "Situação",
    cell: (info) => <ConversationState row={info.row.original} side={side} />,
  });

const updatedColumn = columnHelper.accessor("updatedAt", {
  header: "Última atualização",
  cell: (info) => (
    <SmartDate date={info.getValue()} className="whitespace-nowrap text-muted-foreground" />
  ),
});

const RESELLER_COLUMNS = columnHelper.columns([
  subjectColumn("reseller"),
  stateColumn("reseller"),
  updatedColumn,
]);

const SUPPLIER_COLUMNS = columnHelper.columns([
  subjectColumn("supplier"),
  stateColumn("supplier"),
  updatedColumn,
  columnHelper.display({
    id: "actions",
    header: "Ações",
    cell: (info) => (
      <SupplierConversationActions
        conversation={info.row.original}
        size="compact"
        className="flex-nowrap justify-end"
      />
    ),
  }),
]);

export function ConversationTable({
  side,
  page,
  onPageChange,
}: {
  side: ConversationSide;
  page: { items: ConversationSummary[]; page: number; totalPages: number; total: number };
  onPageChange: (page: number) => void;
}) {
  return (
    <DataTable
      columns={side === "reseller" ? RESELLER_COLUMNS : SUPPLIER_COLUMNS}
      data={page.items}
      getRowId={(row) => row.id}
      pinLastColumn={side === "supplier"}
      caption={
        side === "reseller" ? "Suas conversas com fornecedores" : "Conversas de revendedores"
      }
      renderMobileRow={(row) => <MobileConversationRow row={row} side={side} />}
      footer={
        <PaginationBar
          page={page.page}
          totalPages={page.totalPages}
          total={page.total}
          itemLabel={{ one: "conversa", other: "conversas" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}
