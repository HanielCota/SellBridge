import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | SellBridge" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { session } = Route.useRouteContext();
  return (
    <>
      <PageHeader
        title={`Olá, ${session.user.name}`}
        description="Acompanhe suas vendas, lucro e lojas conectadas."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Seu dashboard está a caminho"
        description="Assim que você publicar produtos e receber pedidos, os indicadores aparecem aqui."
      />
    </>
  );
}
