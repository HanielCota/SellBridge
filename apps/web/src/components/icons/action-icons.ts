import {
  ArrowUpRightIcon,
  BellIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
  PrinterIcon,
  TagIcon,
  WarningCircleIcon,
  XCircleIcon,
  ClockCountdownIcon,
  ArrowRightIcon,
  ChatCircleDotsIcon,
  FactoryIcon,
  TruckIcon,
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
  supplierShips: {
    icon: TruckIcon,
    hint: "O fornecedor despacha o pedido direto para o comprador",
  },
  /** Marks a deadline already missed, so lateness never depends on the amber color alone. */
  overdue: { icon: ClockCountdownIcon },
  openOrder: {
    icon: ArrowRightIcon,
    hint: "Encaminhar ao fornecedor, imprimir etiquetas e acompanhar o envio",
  },
  printLabel: { icon: TagIcon, hint: "Imprime a etiqueta que identifica o volume do pedido" },
  printOrder: {
    icon: PrinterIcon,
    hint: "Imprime a lista do que o fornecedor deve separar e enviar",
  },
  supplierLink: {
    icon: LinkSimpleIcon,
    hint: "Cria um novo link para o fornecedor ver e atualizar este envio",
  },
  revokeLink: { icon: LinkBreakIcon, hint: "O link atual do fornecedor deixa de funcionar" },
  occurrence: {
    icon: WarningCircleIcon,
    hint: "Anota um problema ou observação no histórico do envio",
  },
  cancelShipment: {
    icon: XCircleIcon,
    hint: "Cancela o envio com este fornecedor; não dá para desfazer",
  },
  /** Records the next step of a shipment; each step has its own legend in shipment-hints. */
  advanceStep: { icon: CheckIcon, hint: "Registra a próxima etapa do envio" },
} as const satisfies Record<string, ActionIcon>;

export type ActionIconName = keyof typeof ACTION_ICONS;

/** Legends for terms a reseller may not know, in the GLOSSARIO-UX.md voice. */
export const TERM_HINTS = {
  averageTicket: "Valor médio de cada pedido no período",
  published: "Este produto já está à venda em uma das suas lojas",
  scoreLevel: "Score de 0 a 100, pelas avaliações de quem já vendeu os produtos",
  highlightedSupplier: "Score 90 ou mais, nota 4,7 ou mais e pelo menos 30 pedidos",
  newSupplier: "Tem menos de 10 avaliações; o score aparece depois",
  unitsSold: "Pedidos deste anúncio nos últimos 30 dias",
  healthyMargin: "Verde: sobra lucro; amarelo: lucro baixo; vermelho: prejuízo",
  marketplaceFee: "Média do que o Mercado Livre cobra por venda; muda conforme a categoria",
  characterLimit: "Limite de caracteres que o Mercado Livre aceita",
  suggestedPrice: "Preço que o fornecedor recomenda para este produto",
  reviewAspect: "Parte das avaliações que elogiou este ponto",
  metricGoal: "Acima da meta, o score do fornecedor cai",
} as const;

/** What each order state means for the reseller, keyed like `ORDER_STATUS_LABELS`. */
export const ORDER_STATUS_HINTS: Readonly<Record<string, string>> = {
  pending: "O comprador ainda não pagou; não encaminhe ainda",
  paid: "O comprador pagou; o pedido pode ir para o fornecedor",
  shipped: "O fornecedor despachou; o pedido está a caminho",
  delivered: "O comprador recebeu o pedido",
  cancelled: "O pedido foi cancelado e não será enviado",
  returned: "O comprador devolveu o pedido",
};

/** What each late warning asks of the reseller, keyed like `SHIPMENT_DELAY_LABELS`. */
export const SHIPMENT_DELAY_HINTS: Readonly<Record<string, string>> = {
  accept_overdue: "O fornecedor não aceitou o pedido no prazo",
  dispatch_overdue: "O fornecedor não despachou o pedido no prazo",
  delivery_overdue: "A entrega passou da data prevista",
  awaiting_confirmation: "O pedido parece entregue; confirme a entrega",
};
/** Legends for controls whose name alone does not say what happens. */
export const CONTROL_HINTS = {
  selectForBulk: "Marque para publicar vários produtos de uma vez",
  selectListings: "Marque para pausar ou reativar vários anúncios de uma vez",
  inStockOnly: "Mostra só produtos que o fornecedor tem em estoque",
  hidePublished: "Esconde os produtos que você já publicou",
  sellSupplier: "Conectar uma loja para vender os produtos deste fornecedor",
  listingActions: "Editar preço, pausar e outras ações deste anúncio",
  publishFromCatalog: "Escolher produtos no Catálogo para colocar à venda",
  simulateSale: "Cria um pedido de teste; não cobra ninguém",
  orderStage: "Mostrar só os pedidos que estão numa etapa do envio",
  rateSupplier: "Dar uma nota ao fornecedor por este pedido; ajuda outros revendedores",
  editReview: "Mudar a nota ou o comentário que você deu",
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
