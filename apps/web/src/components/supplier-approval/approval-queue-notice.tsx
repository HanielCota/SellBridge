import { HourglassIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supplierApprovalCountQueryOptions } from "@/features/supplier-approval/approval.queries";

/** On the supplier list: how many sign-ups wait for the team, one tap from the queue. */
export function ApprovalQueueNotice() {
  const query = useQuery(supplierApprovalCountQueryOptions());
  const waiting = query.data ?? 0;
  if (waiting === 0) {
    return null;
  }
  return (
    <Link
      to="/admin/fornecedores/aprovacao"
      className="surface-card flex min-h-11 flex-wrap items-center gap-3 rounded-3xl bg-amber-500/10 px-5 py-4 text-sm"
    >
      <HourglassIcon
        aria-hidden="true"
        className="size-5 shrink-0 text-amber-700 dark:text-amber-400"
      />
      <span className="font-medium">
        {waiting === 1
          ? "1 fornecedor novo espera sua análise"
          : `${waiting} fornecedores novos esperam sua análise`}
      </span>
      <span className="font-medium underline underline-offset-4">Ver fila</span>
    </Link>
  );
}
