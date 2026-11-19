import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PaymentFeeCard } from "@/components/admin-settings/payment-fee-card";
import { RequireReceivingAccountCard } from "@/components/admin-settings/require-receiving-account-card";
import { ReceivingRulesCard } from "@/components/admin-settings/receiving-rules-card";
import { ReturnAnswerDaysCard } from "@/components/admin-settings/return-answer-days-card";
import { PageHeader } from "@/components/layout/page-header";
import { receivingRulesQueryOptions } from "@/features/supplier-payments/receiving-rules.queries";
import { paymentFeeQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { prefetchOnServer } from "@/lib/prefetch";

/** Platform-wide values (money): admins only; the rest of the team lands on the inbox. */
export const Route = createFileRoute("/_app/admin/configuracoes")({
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "settings.manage")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  loader: ({ context }) =>
    Promise.all([
      prefetchOnServer(context.queryClient, paymentFeeQueryOptions()),
      prefetchOnServer(context.queryClient, receivingRulesQueryOptions()),
    ]),
  head: () => ({ meta: [{ title: "Configurações (admin) | SellBridge" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Valores que valem para toda a plataforma." />
      <PaymentFeeCard />
      <RequireReceivingAccountCard />
      <ReceivingRulesCard />
      <ReturnAnswerDaysCard />
    </div>
  );
}
