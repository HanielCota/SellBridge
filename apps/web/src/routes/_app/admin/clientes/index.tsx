import { formatCents } from "@sellbridge/shared/money";
import { ISSUE_SEVERITY, ONBOARDING_STEPS } from "@sellbridge/shared/customer-health";
import {
  customersSearchSchema,
  type CustomerSort,
  type CustomersSearch,
  type CustomerView,
} from "@sellbridge/shared/schemas";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CaretDownIcon,
  CheckCircleIcon,
  LockSimpleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { CustomerAttentionTiles } from "@/components/admin/customer-attention-tiles";
import { CustomerIssuesInbox } from "@/components/admin/customer-issues-inbox";
import { CustomerJourneyBoard } from "@/components/admin/customer-journey-board";
import { CustomerQuickView } from "@/components/admin/customer-quick-view";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";
import { HealthRing } from "@/components/admin/health-ring";
import { SEVERITY_BADGE } from "@/components/admin/issue-style";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { FilterTabs, type FilterTab } from "@/components/data/filter-tabs";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { RankedCustomer } from "@/features/admin/customer-ranking";
import type { adminListCustomers } from "@/features/admin/customers.functions";
import {
  customerIssuesQueryOptions,
  customerJourneyQueryOptions,
  customersQueryOptions,
} from "@/features/admin/customers.queries";
import { describeIssue } from "@/features/admin/issue-copy";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/clientes/")({
  validateSearch: customersSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) => {
    if (search.view === "issues") {
      return prefetchOnServer(
        context.queryClient,
        customerIssuesQueryOptions({
          query: search.query,
          issue: search.issue,
          queue: search.queue,
        }),
      );
    }
    if (search.view === "journey") {
      return prefetchOnServer(context.queryClient, customerJourneyQueryOptions(search.query));
    }
    return prefetchOnServer(context.queryClient, customersQueryOptions(search));
  },
  head: () => ({ meta: [{ title: "Clientes (admin) | SellBridge" }] }),
  component: CustomersPage,
});

type CustomersPageData = Awaited<ReturnType<typeof adminListCustomers>>;

const VIEW_TABS: FilterTab<CustomerView>[] = [
  { value: "list", label: "Lista" },
  { value: "issues", label: "Pendências" },
  { value: "journey", label: "Jornada" },
];

const SORT_TABS: FilterTab<CustomerSort>[] = [
  { value: "health", label: "Pior nota" },
  { value: "revenue", label: "Receita" },
  { value: "name", label: "Nome" },
  { value: "recent", label: "Recentes" },
];

/** Chips shown per row before the rest collapse into "+N". */
const VISIBLE_ISSUE_BADGES = 2;

function useUpdateSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  return (patch: Partial<CustomersSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
}

/** The customer's name opens their quick view in place; the row stays where it was. */
function CustomerToggle({ customer }: { customer: RankedCustomer }) {
  const { open } = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const isOpen = open === customer.id;
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => updateSearch({ open: isOpen ? undefined : customer.id })}
      className="group/toggle flex min-w-52 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0 space-y-0.5">
        <span className="block truncate font-medium underline-offset-4 group-hover/toggle:underline">
          {customer.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{customer.email}</span>
      </span>
      <CaretDownIcon
        weight="bold"
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          isOpen && "rotate-180",
        )}
      />
    </button>
  );
}

/** Who the customer sells, from the suppliers of their shops; pending shops are flagged. */
function supplierSummary(customer: RankedCustomer): { text: string; pending: number } {
  const names = [
    ...new Set(
      customer.stores.flatMap((store) => (store.supplierName === null ? [] : [store.supplierName])),
    ),
  ];
  const pending = customer.stores.filter((store) => store.supplierName === null).length;
  if (customer.stores.length === 0) {
    return { text: "Sem loja", pending };
  }
  return { text: names.length > 0 ? names.join(", ") : "Sem fornecedor", pending };
}

function CustomerStores({ customer }: { customer: RankedCustomer }) {
  const summary = supplierSummary(customer);
  return (
    <div className="flex items-center gap-2">
      {customer.stores.length > 0 ? (
        <span className="flex gap-1">
          {customer.stores.map((store) => {
            const broken = store.status === "expired" || store.status === "error";
            return (
              <span
                key={`${store.marketplace}-${store.shopName}`}
                title={`${store.shopName}${broken ? " (desconectada)" : ""}`}
                className="relative"
              >
                <MarketplaceMark marketplace={store.marketplace} className="size-6 rounded-lg" />
                {broken ? (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive ring-2 ring-card" />
                ) : null}
              </span>
            );
          })}
        </span>
      ) : null}
      <span className="min-w-0 space-y-0.5 text-footnote">
        <span
          className={cn(
            "block max-w-56 truncate",
            customer.stores.length === 0 && "text-muted-foreground",
          )}
          title={summary.text}
        >
          {summary.text}
        </span>
        {summary.pending > 0 ? (
          <span className="block font-medium text-amber-700 dark:text-amber-400">
            {summary.pending === 1
              ? "1 loja sem fornecedor"
              : `${summary.pending} lojas sem fornecedor`}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function CustomerHealthBadges({ customer }: { customer: RankedCustomer }) {
  if (customer.banned) {
    return (
      <Badge variant="destructive">
        <LockSimpleIcon weight="fill" />
        Bloqueado
      </Badge>
    );
  }
  const { issues, completedSteps, nextStep } = customer.health;
  if (issues.length === 0 && nextStep) {
    return (
      <Badge variant="secondary">
        Primeiros passos {completedSteps}/{ONBOARDING_STEPS.length}
      </Badge>
    );
  }
  if (issues.length === 0) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        <CheckCircleIcon weight="fill" />
        Tudo em dia
      </Badge>
    );
  }
  const hidden = issues.length - VISIBLE_ISSUE_BADGES;
  return (
    <span className="flex flex-wrap gap-1">
      {issues.slice(0, VISIBLE_ISSUE_BADGES).map((issue) => (
        <Badge key={issue.kind} className={SEVERITY_BADGE[ISSUE_SEVERITY[issue.kind]]}>
          {describeIssue(issue).badge}
        </Badge>
      ))}
      {hidden > 0 ? <Badge variant="secondary">+{hidden}</Badge> : null}
    </span>
  );
}

function CustomerActionsCell({ customer }: { customer: RankedCustomer }) {
  const { session } = Route.useRouteContext();
  return (
    <div className="flex justify-end">
      <CustomerRowActions customer={customer} isSelf={customer.id === session.user.id} />
    </div>
  );
}

const columnHelper = createServerColumnHelper<RankedCustomer>();
const columns = columnHelper.columns([
  columnHelper.display({
    id: "health",
    header: "Nota",
    cell: (info) => <HealthRing score={info.row.original.health.score} size="sm" />,
  }),
  columnHelper.accessor("name", {
    header: "Cliente",
    cell: (info) => <CustomerToggle customer={info.row.original} />,
  }),
  columnHelper.display({
    id: "stores",
    header: "Lojas e fornecedores",
    cell: (info) => <CustomerStores customer={info.row.original} />,
  }),
  columnHelper.display({
    id: "issues",
    header: "Saúde",
    cell: (info) => <CustomerHealthBadges customer={info.row.original} />,
  }),
  columnHelper.accessor("recentRevenueCents", {
    header: "Últimos 30 dias",
    cell: (info) => (
      <div className="tabular-nums">
        <p className="font-medium">{formatCents(info.getValue())}</p>
        <p className="text-xs text-muted-foreground">{info.row.original.recentOrders} pedidos</p>
      </div>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Ações</span>,
    cell: (info) => <CustomerActionsCell customer={info.row.original} />,
  }),
]);

function MobileCustomerRow({ row }: { row: RankedCustomer }) {
  return (
    <Link to="/admin/clientes/$userId" params={{ userId: row.id }} className="flex gap-3">
      <HealthRing score={row.health.score} size="sm" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="truncate font-medium">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {supplierSummary(row).text} · {formatCents(row.recentRevenueCents)} em 30 dias
          </p>
        </div>
        <CustomerHealthBadges customer={row} />
      </div>
    </Link>
  );
}

function useSearchTerm(search: CustomersSearch) {
  const updateSearch = useUpdateSearch();
  return useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query, page: 1, open: undefined }),
  });
}

function CustomersPage() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const { term, setTerm } = useSearchTerm(search);
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Quem precisa de ajuda aparece primeiro. Resolva daqui ou abra o cliente para editar a conta."
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          legend="Visão"
          tabs={VIEW_TABS}
          value={search.view}
          onChange={(view) => updateSearch({ view, open: undefined })}
        />
        <SearchInput
          label="Buscar clientes"
          placeholder="Buscar por nome ou e-mail"
          className="lg:w-80"
          iconClassName="left-3.5"
          inputClassName="pl-10"
          value={term}
          onValueChange={setTerm}
        />
      </div>
      {search.view === "list" ? <ListView search={search} /> : null}
      {search.view === "issues" ? <IssuesView search={search} /> : null}
      {search.view === "journey" ? <JourneyView query={search.query} /> : null}
    </>
  );
}

const ALL_SUPPLIERS = "__all__";

/** Only the customers selling one supplier, through a shop or the one picked in onboarding. */
function SupplierFilter({
  value,
  options,
  onChange,
}: {
  value: string | undefined;
  options: readonly { id: string; name: string }[];
  onChange: (supplier: string | undefined) => void;
}) {
  const current = options.find((option) => option.id === value);
  return (
    <Select
      value={value ?? ALL_SUPPLIERS}
      onValueChange={(next) => onChange(options.find((option) => option.id === next)?.id)}
    >
      <SelectTrigger className="w-full min-w-0 sm:w-56" aria-label="Filtrar por fornecedor">
        <SelectValue>
          <span className="truncate">{current?.name ?? "Todos os fornecedores"}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SUPPLIERS}>Todos os fornecedores</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ListView({ search }: { search: CustomersSearch }) {
  const query = useQuery(customersQueryOptions(search));
  const updateSearch = useUpdateSearch();
  return (
    <>
      {query.data ? (
        <CustomerAttentionTiles counts={query.data.issueCounts} active={search.issue} />
      ) : (
        <Skeleton className="h-28 rounded-3xl" aria-label="Carregando pendências" />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {query.data ? attentionSummary(query.data) : " "}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SupplierFilter
            value={search.supplier}
            options={query.data?.supplierOptions ?? []}
            onChange={(supplier) => updateSearch({ supplier, page: 1, open: undefined })}
          />
          <FilterTabs
            legend="Ordenar clientes"
            tabs={SORT_TABS}
            value={search.sort}
            onChange={(sort) => updateSearch({ sort, page: 1 })}
          />
        </div>
      </div>
      <CustomersTable
        query={query}
        openId={search.open}
        filtered={search.issue !== undefined}
        onClearFilter={() => updateSearch({ issue: undefined, page: 1 })}
        onPageChange={(page) => updateSearch({ page, open: undefined })}
      />
    </>
  );
}

function attentionSummary(data: CustomersPageData): string {
  const customers = `${data.customerCount} ${data.customerCount === 1 ? "cliente" : "clientes"}`;
  if (data.needingAttention === 0) {
    return `${customers}, todos em dia.`;
  }
  return `${customers} · ${data.needingAttention} ${data.needingAttention === 1 ? "precisa" : "precisam"} de atenção agora.`;
}

function NoCustomers({
  filtered,
  onClearFilter,
}: {
  filtered: boolean;
  onClearFilter: () => void;
}) {
  if (!filtered) {
    return (
      <EmptyState
        icon={UsersThreeIcon}
        title="Nenhum cliente encontrado"
        description="Confira o nome ou o e-mail buscado."
      />
    );
  }
  return (
    <EmptyState
      icon={UsersThreeIcon}
      title="Ninguém com esse problema"
      description="Bom sinal. Limpe o filtro para ver todos os clientes."
      action={
        <Button variant="outline" onClick={onClearFilter}>
          Limpar filtro
        </Button>
      }
    />
  );
}

function CustomersTable({
  query,
  openId,
  filtered,
  onClearFilter,
  onPageChange,
}: {
  query: UseQueryResult<CustomersPageData>;
  openId: string | undefined;
  filtered: boolean;
  onClearFilter: () => void;
  onPageChange: (page: number) => void;
}) {
  const { session } = Route.useRouteContext();
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando clientes" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return <NoCustomers filtered={filtered} onClearFilter={onClearFilter} />;
  }
  return (
    <DataTable
      columns={columns}
      data={query.data.items}
      getRowId={(row) => row.id}
      caption="Clientes da plataforma"
      renderMobileRow={(row) => <MobileCustomerRow row={row} />}
      renderRowDetail={(row) =>
        row.id === openId ? (
          <CustomerQuickView customer={row} isSelf={row.id === session.user.id} />
        ) : null
      }
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel={{ one: "cliente", other: "clientes" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}

function IssuesView({ search }: { search: CustomersSearch }) {
  const { session } = Route.useRouteContext();
  const query = useQuery(
    customerIssuesQueryOptions({
      query: search.query,
      issue: search.issue,
      queue: search.queue,
    }),
  );
  const updateSearch = useUpdateSearch();
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando pendências" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <CustomerIssuesInbox
      entries={query.data.entries}
      total={query.data.total}
      counts={query.data.issueCounts}
      queueCounts={query.data.queueCounts}
      queue={search.queue}
      filter={search.issue}
      adminId={session.user.id}
      onQueueChange={(queue) => updateSearch({ queue })}
      onFilterChange={(issue) => updateSearch({ issue })}
    />
  );
}

function JourneyView({ query: searchQuery }: { query: string | undefined }) {
  const query = useQuery(customerJourneyQueryOptions(searchQuery));
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando jornada" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <CustomerJourneyBoard columns={query.data} />;
}
