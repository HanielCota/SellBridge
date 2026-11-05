import { supplierOrdersUrlSearchSchema } from "@sellbridge/shared/supplier-panel-orders-schema";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { SupplierOrdersInbox } from "@/components/supplier-panel/orders/supplier-orders-inbox";
import { SupplierDownloadMenu } from "@/components/supplier-panel/report/supplier-download-menu";
import { Button } from "@/components/ui/button";
import { SUPPLIER_PANEL_BASE_PATH } from "@/features/supplier-panel/home/attention-links";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";
import { useTabProfileLink } from "@/lib/tab-profile";

export const Route = createFileRoute("/_app/fornecedor/painel/pedidos")({
  validateSearch: supplierOrdersUrlSearchSchema,
  head: () => ({ meta: [{ title: "Pedidos | Painel do fornecedor" }] }),
  component: SupplierOrdersPage,
});

function SupplierOrdersPage() {
  const supplierId = usePanelSupplierId();
  const profileLink = useTabProfileLink();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Os pedidos dos revendedores, do mais atrasado ao prazo mais próximo."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={profileLink(`${SUPPLIER_PANEL_BASE_PATH}/conferir`)}>Conferir com leitor</a>
            </Button>
            <SupplierDownloadMenu />
          </>
        }
      />
      <SupplierOrdersInbox
        supplierId={supplierId}
        search={search}
        onSearchChange={(patch) =>
          void navigate({ search: (previous) => ({ ...previous, ...patch }) })
        }
      />
    </div>
  );
}
