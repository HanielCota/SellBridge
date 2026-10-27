import type {
  SalesHeatmapCell,
  SellerReportCase,
  SellerReportCaseKind,
  StoreBreakdown,
  TopProduct,
} from "@sellbridge/database/repositories";
import { formatReportValue } from "@/features/report-kit/report-format";
import type {
  ReportBarItem,
  ReportCaseTab,
  ReportChart,
  ReportHeatmap,
  ReportRule,
  ReportSplitRow,
} from "@/features/report-kit/report-model";
import type { SellerPeriodNumbers, SellerReportInput } from "./seller-report";

/** Bars of the store chart before the rest fold into "Outras lojas". */
export const STORE_BARS = 5;
const PRODUCT_BARS = 5;
const BASIS_POINTS_PER_UNIT = 10_000;

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;
// Short labels: at 390px the fourth column of "18h–24h" was cut.
const TIME_BANDS = ["0–6h", "6–12h", "12–18h", "18–24h"] as const;

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 2,
});

/** Revenue per store, this period against the previous one; a store sold in either shows. */
function storeBars(
  current: readonly StoreBreakdown[],
  previous: readonly StoreBreakdown[],
): ReportBarItem[] {
  const ids = [...new Set([...current, ...previous].map((store) => store.storeConnectionId))];
  const items = ids.map((id) => {
    const now = current.find((store) => store.storeConnectionId === id);
    const before = previous.find((store) => store.storeConnectionId === id);
    return {
      label: now?.storeName ?? before?.storeName ?? "Loja",
      current: now?.revenueCents ?? 0,
      previous: before?.revenueCents ?? 0,
    };
  });
  const sorted = items.toSorted(
    (first, second) => second.current - first.current || second.previous - first.previous,
  );
  if (sorted.length <= STORE_BARS + 1) {
    return sorted;
  }
  const rest = sorted.slice(STORE_BARS);
  const others = {
    label: `Outras ${rest.length} lojas`,
    current: rest.reduce((total, item) => total + item.current, 0),
    previous: rest.reduce((total, item) => total + item.previous, 0),
  };
  return [...sorted.slice(0, STORE_BARS), others];
}

function productBars(
  current: readonly TopProduct[],
  previous: readonly TopProduct[],
): ReportBarItem[] {
  return current.slice(0, PRODUCT_BARS).map((product) => ({
    label: product.title,
    current: product.revenueCents,
    previous: previous.find((before) => before.title === product.title)?.revenueCents ?? 0,
  }));
}

function heatmapOf(cells: readonly SalesHeatmapCell[]): ReportHeatmap {
  return {
    title: "Quando você vende",
    rowLabels: [...WEEKDAYS],
    columnLabels: [...TIME_BANDS],
    cells: WEEKDAYS.map((_, dayIndex) =>
      TIME_BANDS.map(
        (__, band) =>
          cells.find((cell) => cell.weekday === dayIndex + 1 && cell.band === band)?.orders ?? 0,
      ),
    ),
    unit: "vendas",
  };
}

function splitRow(label: string, period: SellerPeriodNumbers): ReportSplitRow {
  return {
    label,
    yesLabel: "Sem problema",
    yes: period.summary.orders,
    noLabel: "Cancelados ou devolvidos",
    no: period.statuses.cancelled + period.statuses.returned,
  };
}

export function sellerReportCharts(input: SellerReportInput): ReportChart[] {
  const { current, previous } = input;
  const charts: ReportChart[] = [
    {
      kind: "grouped_bars",
      title: "Receita por loja",
      note: "Este período e o anterior, lado a lado.",
      format: "cents",
      items: storeBars(current.byStore, previous.byStore),
    },
    {
      kind: "trend",
      title: "Lucro mês a mês",
      note: "Últimos 6 meses; o mês em andamento conta até hoje.",
      format: "cents",
      target: null,
      points: input.trend.map((month) => ({
        month: month.month,
        value: month.orders === 0 ? null : month.profitCents,
      })),
    },
    {
      kind: "split",
      title: "Pedidos sem problema e com problema",
      note: "Vendas contra cancelados e devolvidos; aguardando pagamento fica de fora.",
      rows: [splitRow("Este período", current), splitRow("Período anterior", previous)],
    },
    {
      kind: "heatmap",
      heatmap: heatmapOf(input.heatmap),
      note: "Vendas por dia da semana e horário de Brasília.",
    },
  ];
  if (current.topProducts.length === 0) {
    return charts;
  }
  return [
    ...charts,
    {
      kind: "grouped_bars",
      title: "Produtos mais vendidos",
      note: "Receita dos 5 produtos que mais venderam, com o período anterior.",
      format: "cents",
      items: productBars(current.topProducts, previous.topProducts),
    },
  ];
}

const CASE_TABS: { kind: SellerReportCaseKind; label: string }[] = [
  { kind: "cost_pending", label: "Custo pendente" },
  { kind: "cancelled", label: "Cancelados" },
  { kind: "returned", label: "Devolvidos" },
];

function caseOf(order: SellerReportCase) {
  return {
    id: order.id,
    title: `Pedido ${order.externalOrderId}`,
    detail: order.storeName,
    meta: `${formatReportValue(order.totalCents, "cents")} · ${shortDate.format(order.orderedAt)}`,
    href: `/pedidos/${order.id}`,
  };
}

export function sellerReportCases(cases: SellerReportInput["cases"]): ReportCaseTab[] {
  return CASE_TABS.map(({ kind, label }) => ({
    key: kind,
    label,
    items: cases[kind].items.map(caseOf),
    more: Math.max(0, cases[kind].total - cases[kind].items.length),
  }));
}

export function sellerReportRules(platformFeeBasisPoints: number): ReportRule[] {
  const platformFee = percentFormatter.format(platformFeeBasisPoints / BASIS_POINTS_PER_UNIT);
  return [
    {
      title: "Período e horário",
      text: "Cada pedido conta no dia em que foi feito, no horário de Brasília. A comparação é com o mês anterior (num mês em andamento, os mesmos dias dele) ou, num intervalo escolhido, com os mesmos dias logo antes.",
    },
    {
      title: "Venda",
      text: "Pedido pago, enviado ou entregue. Aguardando pagamento, cancelado e devolvido não são venda: não entram na receita, no custo nem nas taxas.",
    },
    {
      title: "Lucro",
      text: `Receita menos o custo do fornecedor, a taxa do marketplace, os reembolsos e a tarifa da SellBridge (${platformFee} da receita), mais as comissões recebidas.`,
    },
    {
      title: "Taxas",
      text: "A taxa do marketplace é a que ele informa no pedido, não uma estimativa. Se ele corrigir o valor depois, o mês em andamento acompanha; o mês fechado fica como foi guardado.",
    },
    {
      title: "Reembolsos",
      text: "Reembolsos e comissões contam no mês em que o pedido foi feito, não no dia em que o dinheiro voltou.",
    },
    {
      title: "Custo pendente",
      text: "Venda com um item sem produto do catálogo (anúncio criado fora da SellBridge): a receita entra, mas a venda fica fora do lucro e da margem até o custo ser conhecido.",
    },
    {
      title: "Mês fechado",
      text: "Quando o mês termina, os números dele são guardados e não mudam mais, mesmo que um pedido antigo seja reembolsado depois.",
    },
  ];
}
