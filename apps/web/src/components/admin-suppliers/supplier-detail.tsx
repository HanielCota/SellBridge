import type { AdminSupplier, SupplierSellerStore } from "@sellbridge/database/repositories";
import type { AdminSupplierSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ToneStatus } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminSetSupplierActive } from "@/features/admin-suppliers/suppliers.functions";
import { adminSupplierQueryOptions } from "@/features/admin-suppliers/suppliers.queries";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import { catalogStatusMessage } from "@/features/admin-suppliers/catalog-status";
import { errorMessage } from "@/lib/errors";
import { ProductCsvImport } from "./product-csv-import";
import { ProductList } from "./product-list";
import { SupplierForm } from "./supplier-form";
import { SupplierFlagsSection } from "./supplier-flags-section";
import { sellersSummary, SupplierSellers } from "./supplier-sellers";
import { CONTROL_HINTS } from "@/components/icons/action-icons";
import { BackLink } from "@/components/layout/page-header";
import { Hint } from "@/components/ui/hint";

/** What deactivating does, with the reach the supplier has today. */
function deactivationImpact(sellers: readonly SupplierSellerStore[]): string {
  const reach =
    sellers.length === 0
      ? "Nenhuma loja vende este fornecedor agora."
      : `${sellersSummary(sellers)} vendem este fornecedor: os anúncios dele nessas lojas ficam pausados, e os lojistas veem o aviso no sino.`;
  return `${reach} Os produtos saem do catálogo e os pedidos existentes continuam.`;
}

function toggleLabel(active: boolean, isSaving: boolean): string {
  if (isSaving) {
    return "Salvando…";
  }
  return active ? "Desativar fornecedor" : "Ativar fornecedor";
}

/** Active state and the switch; deactivating asks first, with the impact on resellers. */
function SupplierActiveToggle({
  supplier,
  sellers,
}: {
  supplier: AdminSupplier;
  sellers: readonly SupplierSellerStore[];
}) {
  const [confirming, setConfirming] = useState(false);
  const setActive = useCatalogAction(
    adminSetSupplierActive,
    (result) => catalogStatusMessage("Fornecedor", result),
    () => setConfirming(false),
  );
  return (
    <>
      <ToneStatus
        tone={supplier.active ? "success" : "muted"}
        label={supplier.active ? "Ativo" : "Desativado"}
      />
      <Hint
        label={supplier.active ? CONTROL_HINTS.deactivateSupplier : undefined}
        openOnTap={false}
      >
        <Button
          variant={supplier.active ? "destructive" : "secondary"}
          disabled={setActive.isPending}
          onClick={() => {
            if (supplier.active) {
              setConfirming(true);
              return;
            }
            setActive.mutate({ data: { supplierId: supplier.id, active: true } });
          }}
        >
          {toggleLabel(supplier.active, setActive.isPending && !confirming)}
        </Button>
      </Hint>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => (open ? undefined : setConfirming(false))}
        title={`Desativar ${supplier.name}?`}
        description={deactivationImpact(sellers)}
        confirmLabel="Desativar fornecedor"
        pendingLabel="Desativando…"
        destructive
        isPending={setActive.isPending}
        onConfirm={() => setActive.mutate({ data: { supplierId: supplier.id, active: false } })}
      />
    </>
  );
}

function SupplierHeader({
  supplier,
  sellers,
}: {
  supplier: AdminSupplier;
  sellers: readonly SupplierSellerStore[];
}) {
  return (
    <div className="space-y-4">
      <BackLink to="/admin/fornecedores" label="Fornecedores" />
      <PageHeader
        title={supplier.name}
        description={`${supplier.niche} · ${supplier.city} - ${supplier.state}`}
        actions={<SupplierActiveToggle supplier={supplier} sellers={sellers} />}
      />
      <Alert>
        <AlertDescription>
          Ao desativar um fornecedor, seus produtos saem do catálogo e os anúncios dos revendedores
          são pausados. Os pedidos existentes continuam.
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
      <SupplierHeader supplier={query.data.supplier} sellers={query.data.sellers} />
      <SupplierFlagsSection supplierId={supplierId} />
      <SupplierForm key={supplierId} detail={query.data} />
      <SupplierSellers stores={query.data.sellers} />
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
