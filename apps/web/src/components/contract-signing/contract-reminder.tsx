import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { SignatureIcon } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import type { SessionContract } from "@/features/contract-signing/contract-gate";
import { formatShortDate } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

/** What happens at the deadline, said before it comes. */
function reminderText(contract: SessionContract, kind: ProfileKind, deadline: Date): string {
  const day = formatShortDate(deadline);
  if (contract.standing === "overdue") {
    return `O prazo para assinar o contrato do SellBridge acabou em ${day}. Assine para continuar recebendo pedidos novos.`;
  }
  if (kind === "seller") {
    return `Assine o contrato do SellBridge até ${day}. A partir dessa data, o painel só abre com o contrato assinado.`;
  }
  return `Assine o contrato do SellBridge até ${day}. A partir dessa data, seus produtos param de receber pedidos novos até você assinar.`;
}

/** The strip above every page while the 30 days run (and for a supplier past them). */
export function ContractReminder({
  contract,
  profileKind,
}: {
  contract: SessionContract;
  profileKind: ProfileKind;
}) {
  const href = useRouterState({ select: (state) => state.location.href });
  if (contract.deadline === null) {
    return null;
  }
  const overdue = contract.standing === "overdue";
  return (
    <aside
      aria-label="Contrato do SellBridge"
      className={cn(
        "flex flex-col gap-3 rounded-3xl px-5 py-3 sm:flex-row sm:items-center",
        overdue
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
      )}
    >
      <p className="text-sm">{reminderText(contract, profileKind, new Date(contract.deadline))}</p>
      <Link
        to="/assinar-contrato"
        search={{ redirect: href }}
        className={cn(buttonVariants({ size: "lg" }), "shrink-0 sm:ml-auto")}
      >
        <SignatureIcon aria-hidden="true" />
        Ler e assinar
      </Link>
    </aside>
  );
}
