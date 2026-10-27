import type { ConversationSummary } from "@sellbridge/database/repositories";
import {
  CONVERSATION_STATUS_LABELS,
  SUPPLIER_CONVERSATION_TOPIC_LABELS,
  type ConversationSide,
} from "@sellbridge/shared/supplier-conversation-topics";
import { Link } from "@tanstack/react-router";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SmartDate } from "@/components/data/smart-date";
import { UnreadDot } from "@/components/support/ticket-badges";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";

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

function ConversationState({ row, side }: { row: ConversationSummary; side: ConversationSide }) {
  if (row.hasUnread) {
    return <UnreadDot label="Mensagem nova" />;
  }
  return <TicketStatusBadge status={row.status} labels={CONVERSATION_STATUS_LABELS[side]} />;
}

function ConversationSubject({ row, side }: { row: ConversationSummary; side: ConversationSide }) {
  return (
    <div className="space-y-0.5">
      <Link
        to="/suporte/conversas/$ticketId"
        params={{ ticketId: row.id }}
        className="font-medium underline-offset-4 hover:underline"
      >
        {row.subject}
      </Link>
      <p className="text-sm text-muted-foreground">
        {counterpartLine(row, side)} · {topicLabel(row)}
      </p>
    </div>
  );
}

function MobileConversationRow({
  row,
  side,
}: {
  row: ConversationSummary;
  side: ConversationSide;
}) {
  return (
    <Link
      to="/suporte/conversas/$ticketId"
      params={{ ticketId: row.id }}
      className="block space-y-1.5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium">{row.subject}</p>
        <ConversationState row={row} side={side} />
      </div>
      <p className="text-xs text-muted-foreground">
        {counterpartLine(row, side)} · <SmartDate date={row.updatedAt} />
      </p>
    </Link>
  );
}

const columnHelper = createServerColumnHelper<ConversationSummary>();

function columnsFor(side: ConversationSide) {
  return columnHelper.columns([
    columnHelper.accessor("subject", {
      header: "Assunto",
      cell: (info) => <ConversationSubject row={info.row.original} side={side} />,
    }),
    columnHelper.accessor("status", {
      header: "Situação",
      cell: (info) => <ConversationState row={info.row.original} side={side} />,
    }),
    columnHelper.accessor("updatedAt", {
      header: "Última atualização",
      cell: (info) => (
        <SmartDate date={info.getValue()} className="whitespace-nowrap text-muted-foreground" />
      ),
    }),
  ]);
}

const RESELLER_COLUMNS = columnsFor("reseller");
const SUPPLIER_COLUMNS = columnsFor("supplier");

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
