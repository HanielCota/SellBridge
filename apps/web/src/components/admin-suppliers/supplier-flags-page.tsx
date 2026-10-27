import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierFlagsQueryOptions } from "@/features/admin-suppliers/supplier-flags.queries";
import { errorMessage } from "@/lib/errors";
import { SupplierFlagsPanel } from "./supplier-flags-section";

/**
 * The team's flags page (coordinator decision (a)): open to agents and supervisors, who cannot
 * open the full supplier record. Shows the supplier's name and its flags, nothing else.
 */
export function SupplierFlagsPage({
  supplierId,
  viewerIsAdmin,
}: {
  supplierId: string;
  /** Admins go back to the supplier list; the rest of the team to the ticket inbox. */
  viewerIsAdmin: boolean;
}) {
  const query = useQuery(supplierFlagsQueryOptions(supplierId));
  const back = viewerIsAdmin ? (
    <BackLink to="/admin/fornecedores" label="Fornecedores" />
  ) : (
    <BackLink to="/admin/chamados" label="Chamados" />
  );
  if (query.isPending) {
    return <Skeleton className="h-64 rounded-3xl" aria-label="Carregando flags" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        title={query.data.supplierName}
        description="Flags do fornecedor. Cada uma vale 90 dias e o fornecedor vê no painel."
      />
      <SupplierFlagsPanel supplierId={supplierId} data={query.data} />
    </div>
  );
}
