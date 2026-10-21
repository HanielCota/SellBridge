import { createFileRoute } from "@tanstack/react-router";
import { SupplierHome } from "@/components/supplier-panel/home/supplier-home";
import { supplierAttentionHref } from "@/features/supplier-panel/home/attention-links";
import { useTabProfileLink } from "@/lib/tab-profile";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/")({
  component: SupplierHomePage,
});

function SupplierHomePage() {
  const supplierId = usePanelSupplierId();
  const profileLink = useTabProfileLink();
  return (
    <SupplierHome
      supplierId={supplierId}
      hrefFor={(target) => profileLink(supplierAttentionHref(target))}
    />
  );
}
