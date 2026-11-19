import type { SupplierApprovalStatus } from "@sellbridge/shared/supplier-approval";
import type { StatusTone } from "@/components/data/tone-status";

/**
 * One word for where a supplier stands in the team's lists: its approval first (a supplier
 * still pending or refused is not "Ativo" for anyone), then the team's on/off switch.
 */
export function supplierSituation(supplier: {
  readonly active: boolean;
  readonly approvalStatus: SupplierApprovalStatus;
}): { tone: StatusTone; label: string } {
  if (supplier.approvalStatus === "pending") {
    return { tone: "warning", label: "Em análise" };
  }
  if (supplier.approvalStatus === "refused") {
    return { tone: "danger", label: "Recusado" };
  }
  return supplier.active
    ? { tone: "success", label: "Ativo" }
    : { tone: "muted", label: "Desativado" };
}
