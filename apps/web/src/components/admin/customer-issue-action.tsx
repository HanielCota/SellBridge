import type { CustomerIssue } from "@sellbridge/shared/customer-health";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { adminSendOnboardingReminder } from "@/features/admin/customers.functions";
import { useAdminAction } from "@/features/admin/use-admin-action";
import { useImpersonate } from "@/features/admin/use-impersonate";

interface IssueActionProps {
  customer: { id: string; email: string; banned: boolean };
  issue: CustomerIssue;
}

/** Where the reseller fixes each problem, so the admin lands right on it. */
const IMPERSONATE_TARGETS = {
  store: { path: "/lojas", label: "Reconectar" },
  listings: { path: "/publicacoes", label: "Ver erros" },
  cooling: { path: "/dashboard", label: "Ver painel" },
} as const;

function ReminderButton({ userId }: { userId: string }) {
  const remind = useAdminAction(
    () => adminSendOnboardingReminder({ data: { userId } }),
    "Lembrete enviado por e-mail",
  );
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={remind.isPending}
      onClick={() => remind.mutate(undefined)}
    >
      {remind.isPending ? "Enviando..." : "Enviar lembrete"}
    </Button>
  );
}

/**
 * The one button that moves an issue forward: open the customer's account on the page where it
 * is fixed, answer their ticket, or nudge them by e-mail.
 */
export function CustomerIssueAction({ customer, issue }: IssueActionProps) {
  const { impersonate, pendingUserId } = useImpersonate();
  if (issue.kind === "ticket") {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/admin/chamados" search={{ status: "open", query: customer.email }}>
          Responder
        </Link>
      </Button>
    );
  }
  if (issue.kind === "onboarding") {
    return <ReminderButton userId={customer.id} />;
  }
  const target = IMPERSONATE_TARGETS[issue.kind];
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={customer.banned || pendingUserId !== null}
      title={customer.banned ? "Desbloqueie a conta para entrar como o cliente" : undefined}
      onClick={() => void impersonate(customer.id, target.path)}
    >
      {pendingUserId === customer.id ? "Entrando..." : target.label}
    </Button>
  );
}
