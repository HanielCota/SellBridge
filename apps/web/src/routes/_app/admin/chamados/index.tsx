import type { StaffTicketSummary } from "@sellbridge/database/repositories";
import {
  staffTicketsSearchSchema,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_QUEUE_LABELS,
  TICKET_QUEUES,
  type StaffTicketsSearch,
  type TicketQueue,
} from "@sellbridge/shared/schemas";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { TrayIcon } from "@phosphor-icons/react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
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
  UnreadDot,
} from "@/components/support/ticket-badges";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { TicketStatusFilter } from "@/components/support/ticket-status-filter";
import { Button } from "@/components/ui/button";
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
import { ACTION_ICONS, TERM_HINTS } from "@/components/icons/action-icons";
import { Hint, HintedText } from "@/components/ui/hint";

const MetricsIcon = ACTION_ICONS.supportMetrics.icon;

export const Route = createFileRoute("/_app/admin/chamados/")({
  validateSearch: staffTicketsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, staffTicketsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Chamados (equipe) | SellBridge" }] }),
  component: StaffTicketsPage,
});

const ALL = "__all__";

/** A closed ticket asks nothing of the team: its last message is history, not a to-do. */
function showsUnread(ticket: StaffTicketSummary): boolean {
  return ticket.hasUnread && ticket.status !== "closed";
}

const columnHelper = createServerColumnHelper<StaffTicketSummary>();
const columns = columnHelper.columns([
  columnHelper.accessor("subject", {
    header: "Assunto",
    cell: (info) => {
      const ticket = info.row.original;
      return (
        <div className="space-y-0.5">
          <Link
            to="/admin/chamados/$ticketId"
            params={{ ticketId: ticket.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {ticket.subject}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 text-footnote text-muted-foreground">
            <TicketCategoryLabel category={ticket.category} kind={ticket.tenantKind} />
            {showsUnread(ticket) ? <UnreadDot label="Mensagem nova" /> : null}
          </p>
        </div>
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
    header: "Status",
    cell: (info) => {
      const ticket = info.row.original;
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
  return (
    <Link
      to="/admin/chamados/$ticketId"
      params={{ ticketId: row.id }}
      className="block space-y-1.5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-medium">{row.subject}</p>
        <TicketPriorityBadge priority={row.priority} focusable={false} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TicketStatusBadge status={row.status} />
        <ResponseDeadlineBadge
          status={row.status}
          priority={row.priority}
          awaitingSince={row.awaitingSince}
        />
        {showsUnread(row) ? <UnreadDot label="Mensagem nova" /> : null}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {row.tenantName} · {REQUESTER_KIND_LABELS[row.tenantKind]} ·{" "}
        {row.assigneeName ?? "Sem responsável"} · <SmartDate date={row.updatedAt} />
      </p>
    </Link>
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
    if (!counts.data || queue === "all") {
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
      <SelectTrigger className="w-full lg:w-48" aria-label={label}>
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
    <PageHeader
      title="Chamados"
      description="Pegue os chamados sem responsável e responda dentro do prazo de cada prioridade."
      actions={
        hasStaffPermission(role, "support.metrics") ? (
          <Hint label={ACTION_ICONS.supportMetrics.hint} openOnTap={false}>
            <Button asChild variant="outline">
              <Link to="/admin/chamados/metricas">
                <MetricsIcon aria-hidden="true" />
                Métricas
              </Link>
            </Button>
          </Hint>
        ) : null
      }
    />
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
    <div className="grid gap-3 sm:grid-cols-3 lg:flex">
      <SearchInput
        label="Buscar chamados"
        placeholder="Buscar por assunto, revendedor ou e-mail"
        className="sm:col-span-3 lg:flex-1"
        value={term}
        onValueChange={setTerm}
      />
      <TicketStatusFilter
        value={search.status}
        onChange={(status) => onChange({ status })}
        className="w-full lg:w-48"
      />
      <OptionFilter
        label="Filtrar por prioridade"
        allLabel="Todas as prioridades"
        value={search.priority}
        options={TICKET_PRIORITIES}
        labels={TICKET_PRIORITY_LABELS}
        onChange={(priority) => onChange({ priority })}
      />
      <OptionFilter
        label="Filtrar por tema"
        allLabel="Todos os temas"
        value={search.category}
        options={TICKET_CATEGORIES}
        labels={TICKET_CATEGORY_LABELS}
        onChange={(category) => onChange({ category })}
      />
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
    search.category !== undefined;

  return (
    <>
      <StaffTicketsHeader role={session.user.role} />
      <div className="overflow-x-auto">
        <QueueTabs value={search.queue} onChange={(queue) => updateSearch({ queue })} />
      </div>
      <StaffTicketFilters search={search} onChange={updateSearch} />
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
    description: "Os chamados abertos pelos revendedores aparecem aqui.",
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
      ? { title: "Nenhum chamado encontrado", description: "Ajuste a busca ou os filtros." }
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
        caption="Chamados dos revendedores"
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
