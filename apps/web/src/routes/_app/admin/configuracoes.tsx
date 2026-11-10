import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PaymentFeeCard } from "@/components/admin-settings/payment-fee-card";
import { PageHeader } from "@/components/layout/page-header";
import { paymentFeeQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { prefetchOnServer } from "@/lib/prefetch";

/** Platform-wide values (money): admins only; the rest of the team lands on the inbox. */
export const Route = createFileRoute("/_app/admin/configuracoes")({
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "settings.manage")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  loader: ({ context }) => prefetchOnServer(context.queryClient, paymentFeeQueryOptions()),
  head: () => ({ meta: [{ title: "Configurações (admin) | SellBridge" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Valores que valem para toda a plataforma." />
      <PaymentFeeCard />
    </div>
  );
}
