import {
  ArrowUpRightIcon,
  BellIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleDotsIcon,
  FactoryIcon,
  FileArrowDownIcon,
  HeadsetIcon,
  ListIcon,
  MagnifyingGlassIcon,
  MegaphoneSimpleIcon,
  MinusIcon,
  PackageIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  ShoppingBagIcon,
  SquaresFourIcon,
  StorefrontIcon,
  WalletIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";

/**
 * One icon per FUNCTION, shared by every area (docs/PLANO-UX-ICONES.md): the same function always
 * gets the same icon and tooltip, and two functions never share an icon. Icons are imported one by
 * one so the bundle only carries the ones listed here. Texts follow docs/GLOSSARIO-UX.md.
 */
export interface ActionIcon {
  readonly icon: Icon;
  /** Tooltip text; absent where the visible label already says everything. */
  readonly hint?: string;
}

export const ACTION_ICONS = {
  overview: {
    icon: SquaresFourIcon,
    hint: "Resumo das suas vendas, do lucro e do que precisa de atenção",
  },
  catalog: {
    icon: PackageIcon,
    hint: "Escolha produtos dos fornecedores para vender nas suas lojas",
  },
  listings: { icon: MegaphoneSimpleIcon, hint: "Acompanhe os produtos publicados nas suas lojas" },
  orders: { icon: ShoppingBagIcon, hint: "Veja os pedidos dos compradores e acompanhe os envios" },
  stores: { icon: StorefrontIcon, hint: "Conecte e acompanhe suas lojas do Mercado Livre" },
  financials: { icon: WalletIcon, hint: "Veja receita, custos, lucro e repasses" },
  support: {
    icon: HeadsetIcon,
    hint: "Fale com a equipe do SellBridge ou acompanhe seus chamados",
  },
  search: { icon: MagnifyingGlassIcon, hint: "Buscar pedidos, produtos e lojas" },
  notifications: { icon: BellIcon, hint: "Veja os avisos sobre seus pedidos, lojas e publicações" },
  menu: { icon: ListIcon, hint: "Abrir as seções do SellBridge" },
  /** Opens the full view of a summary card; the destination goes in each call site's hint. */
  seeAll: { icon: ArrowUpRightIcon },
  chartKind: { icon: ChartBarIcon, hint: "Escolha outro jeito de ver o gráfico" },
  /** "Exportar" builds a file from the data; "Baixar" (a ready file) gets another icon. */
  exportReport: { icon: FileArrowDownIcon, hint: "Exportar os pedidos do período em uma planilha" },
  customPeriod: { icon: CalendarBlankIcon, hint: "Escolher as datas do período" },
  supportChat: { icon: ChatCircleDotsIcon, hint: "Converse com a equipe do SellBridge" },
  /** Putting products on sale in a store: one icon for one product or many. */
  publish: { icon: PaperPlaneTiltIcon, hint: "Colocar à venda nas suas lojas" },
  suppliers: { icon: FactoryIcon, hint: "Ver os fornecedores e os produtos de cada um" },
  clearSelection: { icon: XIcon, hint: "Desmarcar todos" },
  decrease: { icon: MinusIcon, hint: "Diminuir o valor" },
  increase: { icon: PlusIcon, hint: "Aumentar o valor" },
  previous: { icon: CaretLeftIcon, hint: "Ver o anterior" },
  next: { icon: CaretRightIcon, hint: "Ver o próximo" },
} as const satisfies Record<string, ActionIcon>;

export type ActionIconName = keyof typeof ACTION_ICONS;

/** Legends for terms a reseller may not know, in the GLOSSARIO-UX.md voice. */
export const TERM_HINTS = {
  averageTicket: "Valor médio de cada pedido no período",
  published: "Este produto já está à venda em uma das suas lojas",
  scoreLevel: "Score de 0 a 100, pelas avaliações de quem já vendeu os produtos",
  highlightedSupplier: "Score 90 ou mais, nota 4,7 ou mais e pelo menos 30 pedidos",
  newSupplier: "Tem menos de 10 avaliações; o score aparece depois",
  reviewAspect: "Parte das avaliações que elogiou este ponto",
  metricGoal: "Acima da meta, o score do fornecedor cai",
} as const;

/** Legends for controls whose name alone does not say what happens. */
export const CONTROL_HINTS = {
  selectForBulk: "Marque para publicar vários produtos de uma vez",
  inStockOnly: "Mostra só produtos que o fornecedor tem em estoque",
  hidePublished: "Esconde os produtos que você já publicou",
  sellSupplier: "Conectar uma loja para vender os produtos deste fornecedor",
} as const;

/**
 * The function behind each top-nav tab, by its route. Tabs of areas not yet reviewed stay out and
 * keep rendering as text only.
 */
export const NAV_TAB_ICONS: Readonly<Record<string, ActionIconName>> = {
  "/dashboard": "overview",
  "/catalogo": "catalog",
  "/publicacoes": "listings",
  "/pedidos": "orders",
  "/lojas": "stores",
  "/financeiro": "financials",
  "/suporte": "support",
};
