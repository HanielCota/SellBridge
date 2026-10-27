import type { AdminExportKind } from "@sellbridge/database/repositories";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { hasStaffPermission, type StaffPermission } from "@sellbridge/shared/staff-access";

/** Which permission each admin spreadsheet asks for (the routes check the same). */
export const EXPORT_PERMISSIONS: Record<AdminExportKind, StaffPermission> = {
  equipe: "support.metrics",
  chamados: "support.metrics",
  clientes: "customers.manage",
  auditoria: "audit.view",
};

/** `/api/admin/exportar/equipe?mes=2026-10&nomes=0`: the period, and the names only when hidden. */
export function adminExportHref(
  kind: AdminExportKind,
  search: ReportPeriodSearch,
  names = true,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }
  if (!names) {
    params.set("nomes", "0");
  }
  return `/api/admin/exportar/${kind}?${params.toString()}`;
}

/** The spreadsheets of `kinds` this role may take, in the order given. */
export function allowedExports(role: string, kinds: readonly AdminExportKind[]): AdminExportKind[] {
  return kinds.filter((kind) => hasStaffPermission(role, EXPORT_PERMISSIONS[kind]));
}
