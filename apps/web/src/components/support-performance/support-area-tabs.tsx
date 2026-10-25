import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useNavigate } from "@tanstack/react-router";
import { FilterTabs } from "@/components/data/filter-tabs";

type SupportArea = "fila" | "desempenho";

const AREA_TABS = [
  { value: "fila", label: "Fila" },
  { value: "desempenho", label: "Desempenho" },
] as const satisfies readonly { value: SupportArea; label: string }[];

/**
 * "Fila · Desempenho" at the top of the support area: the coordination reaches the performance
 * screen in one click without a thirteenth tab in the admin menu. Agents, who cannot see the
 * metrics, get nothing here.
 */
export function SupportAreaTabs({ role, current }: { role: string; current: SupportArea }) {
  const navigate = useNavigate();
  if (!hasStaffPermission(role, "support.metrics")) {
    return null;
  }
  return (
    <FilterTabs
      legend="Área do suporte"
      tabs={AREA_TABS}
      value={current}
      onChange={(next) => {
        if (next === current) {
          return;
        }
        void navigate({ to: next === "fila" ? "/admin/chamados" : "/admin/chamados/metricas" });
      }}
    />
  );
}
