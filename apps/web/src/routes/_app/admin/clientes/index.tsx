import type { CustomerSummary } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import { customersSearchSchema, type CustomersSearch } from "@sellbridge/shared/schemas";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MagnifyingGlassIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { ToneStatus } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { adminListCustomers } from "@/features/admin/customers.functions";
import { customersQueryOptions } from "@/features/admin/customers.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/clientes/")({
  validateSearch: customersSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, customersQueryOptions(search)),
  head: () => ({ meta: [{ title: "Clientes (admin) | SellBridge" }] }),
  component: CustomersPage,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const columnHelper = createServerColumnHelper<CustomerSummary>();
const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Cliente",
    cell: (info) => (
      <div className="min-w-48 space-y-0.5">
        <Link
          to="/admin/clientes/$userId"
          params={{ userId: info.row.original.id }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">{info.row.original.email}</p>
      </div>
    ),
  }),
  columnHelper.accessor("city", {
    header: "Região",
    cell: (info) =>
      info.getValue() ? (
        `${info.getValue()} - ${info.row.original.state ?? ""}`
      ) : (
        <span className="text-muted-foreground">Sem região</span>
      ),
  }),
  columnHelper.accessor("connectedStores", { header: "Lojas" }),
  columnHelper.accessor("publishedListings", {
    header: "Publicações",
    cell: (info) => (
      <span className="tabular-nums">
        {info.getValue()}
        {info.row.original.failedListings > 0 ? (
          <span className="ml-1.5 text-xs text-destructive">
            {info.row.original.failedListings} com erro
          </span>
        ) : null}
      </span>
    ),
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
  columnHelper.accessor("banned", {
    header: "Status",
    cell: (info) => (
      <span className="flex items-center gap-2">
        <ToneStatus
          tone={info.getValue() ? "danger" : "success"}
          label={info.getValue() ? "Bloqueado" : "Ativo"}
        />
        {info.row.original.role === "admin" ? <Badge variant="secondary">Admin</Badge> : null}
      </span>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Cadastro",
    cell: (info) => (
      <span className="text-muted-foreground">{dateFormatter.format(info.getValue())}</span>
    ),
  }),
]);

function useSearchTerm(search: CustomersSearch) {
  const navigate = useNavigate({ from: Route.fullPath });
  const [term, setTerm] = useState(search.query ?? "");
  const debouncedTerm = useDebouncedValue(term, 300);
  useEffect(() => {
    const nextQuery = debouncedTerm.trim().length > 0 ? debouncedTerm.trim() : undefined;
    if (nextQuery === search.query) {
      return;
    }
    void navigate({
      search: (previous) => ({ ...previous, query: nextQuery, page: 1 }),
      replace: true,
    });
  }, [debouncedTerm, navigate, search.query]);
  return { term, setTerm };
}

function CustomersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(customersQueryOptions(search));
  const { term, setTerm } = useSearchTerm(search);
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Revendedores da plataforma. Abra um cliente para editar a conta ou entrar como ele."
      />
      <div className="relative">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Buscar clientes"
          placeholder="Buscar por nome ou e-mail"
          className="pl-10"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
      <CustomersTable
        query={query}
        onPageChange={(page) =>
          void navigate({ search: (previous) => ({ ...previous, page }), replace: true })
        }
      />
    </>
  );
}

function CustomersTable({
  query,
  onPageChange,
}: {
  query: UseQueryResult<Awaited<ReturnType<typeof adminListCustomers>>>;
  onPageChange: (page: number) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-xl" aria-label="Carregando clientes" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={UsersThreeIcon}
        title="Nenhum cliente encontrado"
        description="Confira o nome ou o e-mail buscado."
      />
    );
  }
  return (
    <DataTable
      columns={columns}
      data={query.data.items}
      getRowId={(row) => row.id}
      caption="Clientes da plataforma"
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel="clientes"
          onPageChange={onPageChange}
        />
      }
    />
  );
}
