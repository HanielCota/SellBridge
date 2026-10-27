import type { AdminExportKind } from "@sellbridge/database/repositories";
import { brazilMonthOf, monthLabel } from "@sellbridge/shared/report-period";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DownloadMenu, type DownloadOption } from "@/components/report-kit/download-menu";
import { adminExportHref, allowedExports } from "@/features/admin-report/admin-download-links";
import { useTabProfileLink } from "@/lib/tab-profile";

const EXPORT_COPY: Record<AdminExportKind, { label: string; description: string }> = {
  equipe: {
    label: "Planilha da equipe",
    description: "Uma linha por pessoa: produção, prazo e notas",
  },
  chamados: {
    label: "Planilha dos chamados",
    description: "Um chamado por linha, sem contato do cliente",
  },
  clientes: {
    label: "Planilha dos clientes",
    description: "Uma conta por linha: plano, lojas, pedidos e saúde",
  },
  auditoria: { label: "Planilha da auditoria", description: "Tudo o que a equipe fez no mês" },
};

/** This month on the Brasília calendar, read once per page so renders stay pure. */
function useCurrentMonth(): string {
  const [month] = useState(() => brazilMonthOf(new Date()));
  return month;
}

/** The spreadsheets of this month a role may take, as "Baixar" options. */
export function useAdminExportOptions(
  role: string,
  kinds: readonly AdminExportKind[],
  names = true,
): DownloadOption[] {
  const withProfile = useTabProfileLink();
  const search = { mes: useCurrentMonth() };
  return allowedExports(role, kinds).map((kind) => ({
    kind: "spreadsheet",
    ...EXPORT_COPY[kind],
    href: withProfile(adminExportHref(kind, search, names)),
  }));
}

/** "Baixar" on an admin list (clients, audit): this month's spreadsheet of the page. */
export function AdminDownloadMenu({
  role,
  kinds,
}: {
  role: string;
  kinds: readonly AdminExportKind[];
}) {
  const month = useCurrentMonth();
  const options = useAdminExportOptions(role, kinds);
  if (options.length === 0) {
    return null;
  }
  return <DownloadMenu periodLabel={monthLabel(month)} options={options} />;
}

/**
 * "Baixar" on the support "Desempenho": the team and ticket spreadsheets of this month, the
 * monthly report with charts, and whether the files name the team.
 */
export function SupportDownloadMenu({ role }: { role: string }) {
  const [names, setNames] = useState(true);
  const month = useCurrentMonth();
  const navigate = useNavigate();
  const spreadsheets = useAdminExportOptions(role, ["equipe", "chamados"], names);
  if (spreadsheets.length === 0) {
    return null;
  }
  const report: DownloadOption = {
    kind: "report",
    label: "Relatório com gráficos",
    description: "O mês em uma página, pronta para imprimir",
    onSelect: () => void navigate({ to: "/admin/relatorio" }),
  };
  return (
    <DownloadMenu
      periodLabel={monthLabel(month)}
      options={[...spreadsheets, report]}
      teamNames={{ checked: names, onChange: setNames }}
    />
  );
}
