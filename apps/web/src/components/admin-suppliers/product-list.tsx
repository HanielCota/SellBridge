import type { AdminSupplierProduct } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import type { AdminSupplierSearch } from "@sellbridge/shared/schemas";
import { PackageIcon } from "@phosphor-icons/react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { ToneStatus } from "@/components/data/tone-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminSetProductActive,
  type adminListProducts,
} from "@/features/admin-suppliers/suppliers.functions";
import { shelfLabel, shelfParts } from "@/features/admin-suppliers/shelf-label";
import { adminProductsQueryOptions } from "@/features/admin-suppliers/suppliers.queries";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { ProductForm } from "./product-form";

function ProductActions({
  product,
  onEdit,
}: {
  product: AdminSupplierProduct;
  onEdit: (product: AdminSupplierProduct) => void;
}) {
  const setActive = useCatalogAction(adminSetProductActive, "Status do produto atualizado");
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => onEdit(product)}>
        Editar
      </Button>
      <Button
        variant={product.active ? "destructive" : "secondary"}
        size="sm"
        disabled={setActive.isPending}
        onClick={() =>
          setActive.mutate({
            data: {
              supplierId: product.supplierId,
              productId: product.id,
              active: !product.active,
            },
          })
        }
      >
        {setActive.isPending ? "Salvando..." : product.active ? "Desativar" : "Ativar"}
      </Button>
    </div>
  );
}

/** The shelf count in the row's color; what paid orders hold, quieter beside it. */
function ShelfCount({ stock, reservedStock }: { stock: number; reservedStock: number }) {
  const { shelf, held } = shelfParts(stock, reservedStock);
  return (
    <span className="tabular-nums">
      {shelf}
      {held === null ? null : <span className="text-muted-foreground"> · {held}</span>}
    </span>
  );
}

const columnHelper = createServerColumnHelper<AdminSupplierProduct>();
function productColumns(onEdit: (product: AdminSupplierProduct) => void) {
  return columnHelper.columns([
    columnHelper.accessor("sku", { header: "SKU" }),
    columnHelper.accessor("title", { header: "Produto" }),
    columnHelper.accessor("costCents", {
      header: "Custo",
      cell: (information) => formatCents(information.getValue()),
    }),
    columnHelper.accessor("stock", {
      header: "Estoque",
      cell: (information) => (
        <ShelfCount
          stock={information.getValue()}
          reservedStock={information.row.original.reservedStock}
        />
      ),
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
    columnHelper.display({
      id: "actions",
      header: "Ações",
      cell: (information) => <ProductActions product={information.row.original} onEdit={onEdit} />,
    }),
  ]);
}

function ProductTable({
  query,
  onPageChange,
  onEdit,
}: {
  query: UseQueryResult<Awaited<ReturnType<typeof adminListProducts>>>;
  onPageChange: (page: number) => void;
  onEdit: (product: AdminSupplierProduct) => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando produtos" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        icon={PackageIcon}
        title="Nenhum produto encontrado"
        description="Crie um produto, importe um CSV ou ajuste a busca."
      />
    );
  }
  return (
    <DataTable
      columns={productColumns(onEdit)}
      data={query.data.items}
      caption="Produtos do fornecedor"
      getRowId={(row) => row.id}
      renderMobileRow={(row) => (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium">{row.title}</p>
            <p className="text-sm text-muted-foreground">
              {row.sku} · {formatCents(row.costCents)} · Estoque:{" "}
              {shelfLabel(row.stock, row.reservedStock)}
            </p>
            <ToneStatus
              tone={row.active ? "success" : "muted"}
              label={row.active ? "Ativo" : "Desativado"}
            />
          </div>
          <ProductActions product={row} onEdit={onEdit} />
        </div>
      )}
      footer={
        <PaginationBar
          page={query.data.page}
          totalPages={query.data.totalPages}
          total={query.data.total}
          itemLabel={{ one: "produto", other: "produtos" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}

interface ProductListProps {
  supplierId: string;
  categories: { id: string; name: string }[];
  search: AdminSupplierSearch;
  onSearch: (query: string | undefined) => void;
  onPageChange: (page: number) => void;
}

export function ProductList({
  supplierId,
  categories,
  search,
  onSearch,
  onPageChange,
}: ProductListProps) {
  const [selected, setSelected] = useState<AdminSupplierProduct | null | undefined>(undefined);
  const query = useQuery(adminProductsQueryOptions(supplierId, search));
  const { term, setTerm } = useUrlSearchQuery({ urlQuery: search.query, commitQuery: onSearch });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Produtos</h2>
        <Button onClick={() => setSelected(null)}>Novo produto</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Desativar oculta o produto do catálogo. Anúncios e pedidos existentes continuam disponíveis.
      </p>
      {selected === undefined ? null : (
        <ProductForm
          key={selected?.id ?? "new"}
          supplierId={supplierId}
          product={selected ?? undefined}
          categories={categories}
          onClose={() => setSelected(undefined)}
        />
      )}
      <SearchInput
        label="Buscar produtos"
        placeholder="Buscar por SKU ou título"
        value={term}
        onValueChange={setTerm}
        maxLength={100}
      />
      <div aria-busy={query.isFetching}>
        <ProductTable query={query} onPageChange={onPageChange} onEdit={setSelected} />
      </div>
    </section>
  );
}
