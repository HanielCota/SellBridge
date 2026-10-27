import {
  auditSearchSchema,
  type AuditSearchParams,
  type AuditSourceFilter,
} from "@sellbridge/shared/schemas";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AdminDownloadMenu } from "@/components/admin-report/admin-download-menu";
import { AuditTable } from "@/components/admin-audit/audit-table";
import { FilterTabs, type FilterTab } from "@/components/data/filter-tabs";
import { SearchInput } from "@/components/data/search-input";
import { PageHeader } from "@/components/layout/page-header";
import { auditQueryOptions } from "@/features/admin-audit/audit.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { prefetchOnServer } from "@/lib/prefetch";

/** Item 28.b: the platform's trail is for admins; the rest of the team lands on the inbox. */
export const Route = createFileRoute("/_app/admin/auditoria")({
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "audit.view")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  validateSearch: auditSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, auditQueryOptions(search)),
  head: () => ({ meta: [{ title: "Auditoria (admin) | SellBridge" }] }),
  component: AuditPage,
});

const SOURCE_TABS: FilterTab<AuditSourceFilter | undefined>[] = [
  { value: undefined, label: "Tudo" },
  { value: "account", label: "Contas" },
  { value: "catalog", label: "Catálogo" },
  { value: "support", label: "Suporte" },
];

function useUpdateSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  // A filter changes the list, not the page: keep the scroll where the admin is reading.
  return (patch: Partial<AuditSearchParams>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
}

function auditSummary(total: number, filtered: boolean): string {
  const actions = `${total.toLocaleString("pt-BR")} ${total === 1 ? "ação" : "ações"}`;
  return filtered ? `${actions} com esses filtros` : `${actions} registradas pela equipe`;
}

function AuditPage() {
  const search = Route.useSearch();
  const { session } = Route.useRouteContext();
  const updateSearch = useUpdateSearch();
  const query = useQuery(auditQueryOptions(search));
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (value) => updateSearch({ query: value, page: 1 }),
  });
  const filtered = search.source !== undefined || (search.query ?? "") !== "";
  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Tudo o que a equipe fez nas contas dos clientes, no catálogo e nos chamados, do mais recente para o mais antigo."
        actions={<AdminDownloadMenu role={session.user.role} kinds={["auditoria"]} />}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          legend="Filtrar por área"
          tabs={SOURCE_TABS}
          value={search.source}
          onChange={(source) => updateSearch({ source, page: 1 })}
        />
        <SearchInput
          label="Buscar na auditoria"
          placeholder="Buscar pessoa, cliente ou item"
          className="lg:w-96"
          iconClassName="left-3.5"
          inputClassName="pl-10"
          value={term}
          onValueChange={setTerm}
        />
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {query.data ? auditSummary(query.data.total, filtered) : " "}
      </p>
      <AuditTable
        query={query}
        filtered={filtered}
        onClearFilters={() => updateSearch({ source: undefined, query: undefined, page: 1 })}
        onPageChange={(page) => updateSearch({ page })}
      />
    </>
  );
}
