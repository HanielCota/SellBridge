import {
  reportPeriodLabel,
  reportPeriodSearchOf,
  resolveReportPeriod,
  type ReportPeriod,
} from "@sellbridge/shared/report-period";
import { useNavigate } from "@tanstack/react-router";
import { DownloadMenu, type DownloadOption } from "@/components/report-kit/download-menu";
import { useTabProfileLink } from "@/lib/tab-profile";

const SUPPLIER_EXPORT_PATH = "/api/fornecedor/exportar";

function exportHref(sheet: "pedidos" | "produtos", period: ReportPeriod): string {
  const search = new URLSearchParams(reportPeriodSearchOf(period));
  return `${SUPPLIER_EXPORT_PATH}/${sheet}?${search.toString()}`;
}

/**
 * The supplier's two spreadsheets of the period. The browser downloads them itself, with no
 * profile header, so each link names the tab's profile (`?perfil=`).
 */
export function useSupplierSpreadsheets(period: ReportPeriod): DownloadOption[] {
  const withProfile = useTabProfileLink();
  return [
    {
      kind: "spreadsheet",
      label: "Planilha dos pedidos",
      description: "Um item de pedido por linha, com prazos e o valor que você recebe",
      href: withProfile(exportHref("pedidos", period)),
    },
    {
      kind: "spreadsheet",
      label: "Planilha dos produtos",
      description: "Estoque, situação, revendedores que anunciam e vendidos no período",
      href: withProfile(exportHref("produtos", period)),
    },
  ];
}

/** The current month, read at render in Brazil time. */
function currentMonthPeriod(): ReportPeriod {
  return resolveReportPeriod({}, new Date());
}

/**
 * "Baixar" in the header of Pedidos, Produtos and Desempenho: this month's spreadsheets and
 * the report with charts, where another month or a range can be picked.
 */
export function SupplierDownloadMenu() {
  const period = currentMonthPeriod();
  const spreadsheets = useSupplierSpreadsheets(period);
  const navigate = useNavigate();
  const report: DownloadOption = {
    kind: "report",
    label: "Relatório com gráficos",
    description: "Prazos, avaliações e mais vendidos do mês, pronto para imprimir",
    onSelect: () =>
      void navigate({ to: "/fornecedor/painel/relatorio", search: reportPeriodSearchOf(period) }),
  };
  return (
    <DownloadMenu
      periodLabel={reportPeriodLabel(period)}
      options={[...spreadsheets, report]}
      size="default"
    />
  );
}
