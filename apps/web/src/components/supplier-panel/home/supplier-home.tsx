import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { supplierHomeQueryOptions } from "@/features/supplier-panel/home/home.queries";
import { HomeQueue, HomeQueueSkeleton } from "./home-queue";

interface SupplierHomeProps {
  supplierId: string;
  hrefFor: (target: SupplierAttentionTarget) => string;
}

/**
 * "Início" of the supplier panel, one list first (Mercado Livre's "Vendas", Shopee's "Lista de
 * tarefas"): what waits for the accept, what is under way, what to fix in the catalog, each with
 * the product photo, and the health in one line underneath.
 */
export function SupplierHome({ supplierId, hrefFor }: SupplierHomeProps) {
  const query = useQuery(supplierHomeQueryOptions(supplierId));
  const header = (
    <PageHeader
      title="Início"
      {...(query.data === undefined ? {} : { description: query.data.supplierName })}
    />
  );
  // A failed background refresh keeps the list already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          message="Não foi possível carregar o Início, tente de novo."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {header}
      {query.data === undefined ? (
        <HomeQueueSkeleton />
      ) : (
        <HomeQueue supplierId={supplierId} data={query.data} hrefFor={hrefFor} />
      )}
    </div>
  );
}
