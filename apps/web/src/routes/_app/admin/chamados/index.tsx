import type { StaffTicketSummary } from "@sellbridge/database/repositories";
import { CONVERSATION_STATUS_LABELS } from "@sellbridge/shared/supplier-conversation-topics";
import {
  staffTicketsSearchSchema,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_QUEUE_LABELS,
  TICKET_QUEUES,
  TICKET_STATUS_LABELS,
  type StaffTicketsSearch,
  type TicketQueue,
} from "@sellbridge/shared/schemas";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { TrayIcon } from "@phosphor-icons/react";
import { type ReactNode, useRef } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { scrollEdgeMask, useScrollEdges } from "@/components/data/use-scroll-edges";
import { FilterTabs } from "@/components/data/filter-tabs";
import { REQUESTER_KIND_LABELS } from "@/features/support/ticket-audience";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { SmartDate } from "@/components/data/smart-date";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  ResponseDeadlineBadge,
  TicketCategoryLabel,
  TicketPriorityBadge,
  UnreadSubject,
  unreadSubjectClass,
} from "@/components/support/ticket-badges";
import { StaffShortcutFilters } from "@/components/support/staff-shortcut-filters";
import { SupportAreaTabs } from "@/components/support-performance/support-area-tabs";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { TicketStatusFilter } from "@/components/support/ticket-status-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { staffListTickets } from "@/features/support/support.functions";
import {
  staffQueueCountsQueryOptions,
  staffTicketsQueryOptions,
} from "@/features/support/support.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

export const Route = createFileRoute("/_app/admin/chamados/")({
  validateSearch: staffTicketsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, staffTicketsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Chamados (equipe) | SellBridge" }] }),
  component: StaffTicketsPage,
});

const ALL = "__all__";
const UNREAD_LABEL = "Mensagem nova";

/**
 * A closed ticket asks nothing of the team: its last message is history, not a to-do. Nor does a
 * supplier conversation, which the supplier answers.
 */
function showsUnread(ticket: StaffTicketSummary): boolean {
  return ticket.hasUnread && ticket.status !== "closed" && ticket.audience === "platform";
}

const columnHelper = createServerColumnHelper<StaffTicketSummary>();
const columns = columnHelper.columns([
  columnHelper.accessor("subject", {
    header: "Assunto",
    cell: (info) => {
      const ticket = info.row.original;
      const unread = showsUnread(ticket);
      return (
        <UnreadSubject unread={unread} label={UNREAD_LABEL} hanging>
          {/* Cells keep one line by default; a long subject (order numbers and all) wraps instead
              of pushing Situação and Atualizado out of the table beside the sidebar. */}
          <div className="min-w-56 space-y-0.5 whitespace-normal">
            <Link
              to="/admin/chamados/$ticketId"
              params={{ ticketId: ticket.id }}
              className={cn(unreadSubjectClass(unread), "underline-offset-4 hover:underline")}
            >
              {ticket.subject}
            </Link>
            <p className="flex flex-wrap items-center gap-x-2 text-footnote text-muted-foreground">
              <TicketCategoryLabel category={ticket.category} kind={ticket.tenantKind} />
              {ticket.supplierName === null ? null : <span>Para {ticket.supplierName}</span>}
            </p>
          </div>
        </UnreadSubject>
      );
    },
  }),
  columnHelper.accessor("tenantName", {
    header: "Cliente",
    cell: (info) => (
      <div className="space-y-0.5">
        <p>{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">
          {REQUESTER_KIND_LABELS[info.row.original.tenantKind]} · {info.row.original.createdByEmail}
        </p>
      </div>
    ),
  }),
  columnHelper.accessor("priority", {
    header: () => (
      <HintedText label={TERM_HINTS.ticketPriority} className="hinted-term">
        Prioridade
      </HintedText>
    ),
    cell: (info) => <TicketPriorityBadge priority={info.getValue()} />,
  }),
  columnHelper.accessor("assigneeName", {
    header: "Responsável",
    cell: (info) =>
      info.getValue() ?? <span className="text-muted-foreground">Sem responsável</span>,
  }),
  columnHelper.accessor("status", {
    header: "Situação",
    cell: (info) => {
      const ticket = info.row.original;
      // A supplier conversation waits for the supplier: no team deadline applies to it.
      if (ticket.audience === "supplier") {
        return (
          <TicketStatusBadge status={ticket.status} labels={CONVERSATION_STATUS_LABELS.reseller} />
        );
      }
      return (
        <div className="flex flex-col items-start gap-1">
          <TicketStatusBadge status={ticket.status} />
          <ResponseDeadlineBadge
            focusable={false}
            status={ticket.status}
            priority={ticket.priority}
            awaitingSince={ticket.awaitingSince}
          />
        </div>
      );
    },
  }),
  columnHelper.accessor("updatedAt", {
    header: "Atualizado",
    cell: (info) => (
      <SmartDate date={info.getValue()} className="whitespace-nowrap text-muted-foreground" />
    ),
  }),
]);

function MobileTicketRow({ row }: { row: StaffTicketSummary }) {
  const unread = showsUnread(row);
  return (
    <Link to="/admin/chamados/$ticketId" params={{ ticketId: row.id }} className="block">
      <UnreadSubject unread={unread} label={UNREAD_LABEL}>
        <MobileTicketRowBody row={row} unread={unread} />
      </UnreadSubject>
    </Link>
  );
}

function MobileTicketRowBody({ row, unread }: { row: StaffTicketSummary; unread: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <p className={cn("min-w-0", unreadSubjectClass(unread))}>{row.subject}</p>
        <TicketPriorityBadge priority={row.priority} focusable={false} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TicketStatusBadge
          status={row.status}
          labels={
            row.audience === "supplier" ? CONVERSATION_STATUS_LABELS.reseller : TICKET_STATUS_LABELS
          }
        />
        {row.audience === "supplier" ? null : (
          <ResponseDeadlineBadge
            status={row.status}
            priority={row.priority}
            awaitingSince={row.awaitingSince}
          />
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {row.tenantName} · {REQUESTER_KIND_LABELS[row.tenantKind]} ·{" "}
        {row.assigneeName ?? "Sem responsável"} · <SmartDate date={row.updatedAt} />
      </p>
    </div>
  );
}

function QueueTabs({
  value,
  onChange,
}: {
  value: TicketQueue;
  onChange: (queue: TicketQueue) => void;
}) {
  const counts = useQuery(staffQueueCountsQueryOptions());
  const countOf = (queue: TicketQueue) => {
    if (!counts.data || queue === "all" || queue === "suppliers") {
      return undefined;
    }
    return counts.data[queue];
  };
  const tabs = TICKET_QUEUES.map((queue) => ({
    value: queue,
    label: TICKET_QUEUE_LABELS[queue],
    count: countOf(queue),
  }));
  return (
    <>
      {/* On a phone the four tabs never fit, and "Atrasados" sat past the edge with no cue. */}
      <div className="sm:hidden">
        <QueueSelect tabs={tabs} value={value} onChange={onChange} />
      </div>
      <div className="hidden sm:block">
        <FilterTabs legend="Fila de chamados" value={value} onChange={onChange} tabs={tabs} />
      </div>
    </>
  );
}

function queueOptionLabel(tab: { label: string; count: number | undefined }): string {
  return tab.count === undefined ? tab.label : `${tab.label} · ${tab.count}`;
}

function QueueSelect({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { value: TicketQueue; label: string; count: number | undefined }[];
  value: TicketQueue;
  onChange: (queue: TicketQueue) => void;
}) {
  const current = tabs.find((tab) => tab.value === value);
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const queue = TICKET_QUEUES.find((option) => option === next);
        if (queue !== undefined) {
          onChange(queue);
        }
      }}
    >
      <SelectTrigger className="w-full" aria-label="Fila de chamados">
        <SelectValue>{current ? queueOptionLabel(current) : ""}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {tabs.map((tab) => (
          <SelectItem key={tab.value} value={tab.value}>
            {queueOptionLabel(tab)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OptionFilter<TValue extends string>({
  label,
  allLabel,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: TValue | undefined;
  options: readonly TValue[];
  labels: Record<TValue, string>;
  onChange: (value: TValue | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(options.find((option) => option === next))}
    >
      <SelectTrigger className={FILTER_SELECT_CLASSES} aria-label={label}>
        <SelectValue>{value ? labels[value] : allLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StaffTicketsHeader({ role }: { role: string }) {
  return (
    <>
      <SupportAreaTabs role={role} current="fila" />
      <PageHeader
        title="Chamados"
        description="Pegue os chamados sem responsável e responda dentro do prazo de cada prioridade."
      />
    </>
  );
}

function StaffTicketFilters({
  search,
  onChange,
}: {
  search: StaffTicketsSearch;
  onChange: (patch: Partial<StaffTicketsSearch>) => void;
}) {
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (nextQuery) => onChange({ query: nextQuery }),
  });
  return (
    <PinnedToolbar>
      <SearchInput
        label="Buscar chamados"
        placeholder="Assunto, revendedor ou e-mail"
        className="lg:flex-1"
        value={term}
        onValueChange={setTerm}
      />
      <FilterRow>
        <TicketStatusFilter
          value={search.status}
          onChange={(status) => onChange({ status })}
          className={FILTER_SELECT_CLASSES}
        />
        <OptionFilter
          label="Filtrar por tema"
          allLabel="Todos os temas"
          value={search.category}
          options={TICKET_CATEGORIES}
          labels={TICKET_CATEGORY_LABELS}
          onChange={(category) => onChange({ category })}
        />
        {/* The longest label last: on a phone the first two fit whole and this one peeks out at
            the edge, showing the row goes on. */}
        <OptionFilter
          label="Filtrar por prioridade"
          allLabel="Todas as prioridades"
          value={search.priority}
          options={TICKET_PRIORITIES}
          labels={TICKET_PRIORITY_LABELS}
          onChange={(priority) => onChange({ priority })}
        />
      </FilterRow>
    </PinnedToolbar>
  );
}

/** On a phone each filter takes its text's width in one row; from `sm` they share the line. */
const FILTER_SELECT_CLASSES = "w-auto shrink-0 sm:w-full lg:w-48";

/**
 * The search and its filters stay pinned under the header (and the team strip) while the list
 * scrolls: scrolling past them used to leave them cut in half beneath the strip.
 */
function PinnedToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-[var(--app-header-height,0px)] z-20 -mx-4 -mt-3 mb-3 flex flex-col gap-3 bg-background/85 px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8 lg:flex-row">
      {children}
    </div>
  );
}

/**
 * Stacked, three filters under the search took most of a phone's screen once pinned: there they
 * sit in one row that scrolls sideways, its faded edge showing there is more.
 */
function FilterRow({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const mask = scrollEdgeMask(useScrollEdges(rowRef));
  return (
    <div
      ref={rowRef}
      className="-mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 lg:flex [&::-webkit-scrollbar]:hidden"
      style={mask === undefined ? undefined : { maskImage: mask }}
    >
      {children}
    </div>
  );
}

function StaffTicketsPage() {
  const search = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(staffTicketsQueryOptions(search));

  function updateSearch(patch: Partial<StaffTicketsSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true });
  }

  const isFiltered =
    search.query !== undefined ||
    search.status !== undefined ||
    search.priority !== undefined ||
    search.category !== undefined ||
    search.situacao !== undefined ||
    search.responsavel !== undefined ||
    search.origem !== undefined;

  return (
    <>
      <StaffTicketsHeader role={session.user.role} />
      <div className="overflow-x-auto">
        <QueueTabs value={search.queue} onChange={(queue) => updateSearch({ queue })} />
      </div>
      <StaffTicketFilters search={search} onChange={updateSearch} />
      <StaffShortcutFilters search={search} onChange={updateSearch} />
      <StaffTicketsTable
        query={query}
        queue={search.queue}
        isFiltered={isFiltered}
        onPageChange={(page) => updateSearch({ page })}
      />
    </>
  );
}

const EMPTY_QUEUE_TEXT: Record<TicketQueue, { title: string; description: string }> = {
  unassigned: {
    title: "Nenhum chamado esperando alguém",
    description: "Todo chamado em aberto já tem um responsável.",
  },
  mine: {
    title: "Sua caixa está vazia",
    description: "Pegue um chamado na fila “Sem responsável” para começar.",
  },
  overdue: {
    title: "Nada atrasado",
    description: "Todos os chamados estão dentro do prazo de resposta.",
  },
  all: {
    title: "Nenhum chamado",
    description: "Os chamados abertos por revendedores e fornecedores aparecem aqui.",
  },
  suppliers: {
    title: "Nenhuma conversa entre revendedor e fornecedor",
    description:
      "As conversas aparecem aqui para a equipe acompanhar. Quem responde é o fornecedor.",
  },
};

function StaffTicketsTable({
  query,
  queue,
  isFiltered,
  onPageChange,
}: {
  query: UseQueryResult<Awaited<ReturnType<typeof staffListTickets>>>;
  queue: TicketQueue;
  isFiltered: boolean;
  onPageChange: (page: number) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando chamados" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    const text = isFiltered
      ? {
          title: "Nenhum chamado com esses filtros",
          description: "Tire um filtro ou mude o que digitou.",
        }
      : EMPTY_QUEUE_TEXT[queue];
    return <EmptyState icon={TrayIcon} title={text.title} description={text.description} />;
  }
  return (
    // While a new filter loads, the previous rows stay but dim, so the change reads as pending.
    <div
      className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}
      aria-busy={query.isPlaceholderData}
    >
      <DataTable
        columns={columns}
        data={query.data.items}
        getRowId={(row) => row.id}
        caption="Chamados de revendedores e fornecedores"
        renderMobileRow={(row) => <MobileTicketRow row={row} />}
        footer={
          <PaginationBar
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            itemLabel={{ one: "chamado", other: "chamados" }}
            onPageChange={onPageChange}
          />
        }
      />
    </div>
  );
}
