import { supplierOrdersUrlSearchSchema } from "@sellbridge/shared/supplier-panel-orders-schema";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { SupplierOrdersInbox } from "@/components/supplier-panel/orders/supplier-orders-inbox";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/pedidos")({
  validateSearch: supplierOrdersUrlSearchSchema,
  head: () => ({ meta: [{ title: "Pedidos | Painel do fornecedor" }] }),
  component: SupplierOrdersPage,
});

function SupplierOrdersPage() {
  const supplierId = usePanelSupplierId();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Os pedidos dos revendedores, do mais atrasado ao prazo mais próximo."
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
