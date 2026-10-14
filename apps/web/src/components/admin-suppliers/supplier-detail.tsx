import type { AdminSupplier } from "@sellbridge/database/repositories";
import type { AdminSupplierSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ToneStatus } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminSetSupplierActive } from "@/features/admin-suppliers/suppliers.functions";
import { adminSupplierQueryOptions } from "@/features/admin-suppliers/suppliers.queries";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import { errorMessage } from "@/lib/errors";
import { ProductCsvImport } from "./product-csv-import";
import { ProductList } from "./product-list";
import { SupplierForm } from "./supplier-form";

function SupplierHeader({ supplier }: { supplier: AdminSupplier }) {
  const setActive = useCatalogAction(adminSetSupplierActive, "Status do fornecedor atualizado");
  return (
    <div className="space-y-4">
      <Link to="/admin/fornecedores" className="text-sm text-muted-foreground underline">
        Voltar aos fornecedores
      </Link>
      <PageHeader
        title={supplier.name}
        description={`${supplier.niche} · ${supplier.city} - ${supplier.state}`}
        actions={
          <>
            <ToneStatus
              tone={supplier.active ? "success" : "muted"}
              label={supplier.active ? "Ativo" : "Desativado"}
            />
            <Button
              variant={supplier.active ? "destructive" : "secondary"}
              disabled={setActive.isPending}
              onClick={() =>
                setActive.mutate({ data: { supplierId: supplier.id, active: !supplier.active } })
              }
            >
              {setActive.isPending
                ? "Salvando…"
                : supplier.active
                  ? "Desativar fornecedor"
                  : "Ativar fornecedor"}
            </Button>
          </>
        }
      />
      <Alert>
        <AlertDescription>
          Ao desativar um fornecedor, seus produtos somem do catálogo dos revendedores. Anúncios
          publicados e pedidos existentes continuam funcionando.
        </AlertDescription>
      </Alert>
    </div>
  );
}

interface SupplierDetailProps {
  supplierId: string;
  search: AdminSupplierSearch;
  onSearch: (query: string | undefined) => void;
  onPageChange: (page: number) => void;
}
export function SupplierDetail({
  supplierId,
  search,
  onSearch,
  onPageChange,
}: SupplierDetailProps) {
  const query = useQuery(adminSupplierQueryOptions(supplierId));
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando fornecedor" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <div className="space-y-6">
      <SupplierHeader supplier={query.data.supplier} />
      <SupplierForm key={supplierId} detail={query.data} />
      <ProductList
        supplierId={supplierId}
        categories={query.data.categories}
        search={search}
        onSearch={onSearch}
        onPageChange={onPageChange}
      />
      <ProductCsvImport supplierId={supplierId} categories={query.data.categories} />
    </div>
  );
}
