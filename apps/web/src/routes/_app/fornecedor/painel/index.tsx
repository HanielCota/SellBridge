import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SupplierHome } from "@/components/supplier-panel/home/supplier-home";
import { supplierAttentionHref } from "@/features/supplier-panel/home/attention-links";
import {
  supplierSalesSearchSchema,
  type SupplierSalesSearch,
} from "@/features/supplier-panel/sales/sales-search";
import { useTabProfileLink } from "@/lib/tab-profile";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/")({
  validateSearch: supplierSalesSearchSchema,
  component: SupplierHomePage,
});

function SupplierHomePage() {
  const supplierId = usePanelSupplierId();
  const profileLink = useTabProfileLink();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function updateSearch(patch: Partial<SupplierSalesSearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }
  return (
    <SupplierHome
      supplierId={supplierId}
      search={search}
      onSearchChange={updateSearch}
      hrefFor={(target) => profileLink(supplierAttentionHref(target))}
    />
  );
}
