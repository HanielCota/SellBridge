import { StorefrontIcon } from "@phosphor-icons/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EmptyState } from "@/components/feedback/empty-state";
import { getOwnSupplierFn } from "@/features/supplier-panel/panel.functions";

export const Route = createFileRoute("/_app/fornecedor/painel")({
  loader: async () => getOwnSupplierFn(),
  head: () => ({ meta: [{ title: "Painel do fornecedor | SellBridge" }] }),
  component: SupplierPanelLayout,
});

function SupplierPanelLayout() {
  const { supplier } = Route.useLoaderData();
  if (supplier === null) {
    return (
      <EmptyState
        icon={StorefrontIcon}
        title="Falta cadastrar sua marca"
        description="Com o nome, o nicho e a cidade da sua marca, você cadastra produtos e recebe pedidos dos revendedores por aqui."
      />
    );
  }
  return <Outlet />;
}
