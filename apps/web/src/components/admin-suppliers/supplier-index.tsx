import type { adminListSuppliers } from "@/features/admin-suppliers/suppliers.functions";
import type { AdminSupplier } from "@sellbridge/database/repositories";
import type { AdminSupplierSearch } from "@sellbridge/shared/schemas";
import { StorefrontIcon } from "@phosphor-icons/react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { ToneStatus } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminSuppliersQueryOptions } from "@/features/admin-suppliers/suppliers.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { reviewQueueCountQueryOptions } from "@/features/admin-product-review/review.queries";
import { SupplierForm } from "./supplier-form";
import { ACTION_ICONS, CONTROL_HINTS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";

const columnHelper = createServerColumnHelper<AdminSupplier>();
const supplierColumns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Fornecedor",
    cell: (information) => (
      <Link
        to="/admin/fornecedores/$supplierId"
        params={{ supplierId: information.row.original.id }}
        className="font-medium underline-offset-4 hover:underline"
      >
        {information.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("niche", { header: "Nicho" }),
  columnHelper.accessor("city", {
    header: "Origem",
    cell: (information) => `${information.getValue()} - ${information.row.original.state}`,
  }),
  columnHelper.accessor("active", {
    header: "Status",
    cell: (information) => (
      <ToneStatus
        tone={information.getValue() ? "success" : "muted"}
        label={information.getValue() ? "Ativo" : "Desativado"}
      />
    ),
  }),
]);

const CreateIcon = ACTION_ICONS.createProduct.icon;

/** Products suppliers sent through their panel wait here for the platform's review. */
function ReviewQueueLink() {
  const pending = useQuery(reviewQueueCountQueryOptions()).data ?? 0;
  return (
    <Hint label={CONTROL_HINTS.reviewQueue} openOnTap={false}>
      <Button asChild variant="outline">
        <Link to="/admin/fornecedores/analise">
          Produtos em análise
          {pending > 0 ? (
            <span className="rounded-full bg-primary px-2 text-footnote font-semibold text-primary-foreground tabular-nums">
              {pending}
            </span>
          ) : null}
        </Link>
      </Button>
    </Hint>
  );
}

interface SupplierIndexProps {
  search: AdminSupplierSearch;
  onSearch: (query: string | undefined) => void;
  onPageChange: (page: number) => void;
  onCreated: (supplierId: string) => void;
}

function SupplierTable({
  query,
  onPageChange,
}: {
  query: UseQueryResult<Awaited<ReturnType<typeof adminListSuppliers>>>;
  onPageChange: (page: number) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando fornecedores" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={StorefrontIcon}
        title="Nenhum fornecedor encontrado"
        description="Cadastre o primeiro fornecedor ou ajuste sua busca."
      />
    );
  }
  return (
    <DataTable
      columns={supplierColumns}
      data={query.data.items}
      caption="Fornecedores da plataforma"
      getRowId={(row) => row.id}
      renderMobileRow={(row) => (
        <Link
          to="/admin/fornecedores/$supplierId"
          params={{ supplierId: row.id }}
          className="block space-y-2"
        >
          <p className="font-medium">{row.name}</p>
          <p className="text-sm text-muted-foreground">
            {row.niche} · {row.city} - {row.state}
          </p>
          <ToneStatus
            tone={row.active ? "success" : "muted"}
            label={row.active ? "Ativo" : "Desativado"}
          />
        </Link>
      )}
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel={{ one: "fornecedor", other: "fornecedores" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}

export function SupplierIndex({ search, onSearch, onPageChange, onCreated }: SupplierIndexProps) {
  const [creating, setCreating] = useState(false);
  const query = useQuery(adminSuppliersQueryOptions(search));
  const { term, setTerm } = useUrlSearchQuery({ urlQuery: search.query, commitQuery: onSearch });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fornecedores"
        description="Cadastre fornecedores, regiões atendidas e produtos do catálogo."
        actions={
          <div className="flex flex-wrap gap-2">
            <ReviewQueueLink />
            <Hint label={creating ? undefined : CONTROL_HINTS.createSupplier} openOnTap={false}>
              <Button onClick={() => setCreating((current) => !current)}>
                {creating ? null : <CreateIcon aria-hidden="true" />}
                {creating ? "Fechar cadastro" : "Novo fornecedor"}
              </Button>
            </Hint>
          </div>
        }
      />
      {creating ? <SupplierForm onSaved={(supplier) => onCreated(supplier.id)} /> : null}
      <SearchInput
        label="Buscar fornecedores"
        placeholder="Buscar por nome, nicho ou cidade"
        value={term}
        onValueChange={setTerm}
      />
      <div aria-busy={query.isFetching}>
        <SupplierTable query={query} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
