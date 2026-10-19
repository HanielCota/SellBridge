import {
  ArrowUpRightIcon,
  BellIcon,
  CalendarBlankIcon,
  ChartBarIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
  PrinterIcon,
  TagIcon,
  WarningCircleIcon,
  XCircleIcon,
  ClockCountdownIcon,
  ClockIcon,
  ArrowRightIcon,
  ChatCircleDotsIcon,
  FactoryIcon,
  FileArrowUpIcon,
  GaugeIcon,
  HouseIcon,
  PaletteIcon,
  TruckIcon,
  FileArrowDownIcon,
  HeadsetIcon,
  ListIcon,
  MagnifyingGlassIcon,
  MegaphoneSimpleIcon,
  MinusIcon,
  PackageIcon,
  PaperPlaneTiltIcon,
  PlugsIcon,
  PlusIcon,
  ShoppingBagIcon,
  SquaresFourIcon,
  StarIcon,
  StorefrontIcon,
  TrashIcon,
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
  /** Stops syncing a store; never the sign-out icon, which leaves the account. */
  disconnectStore: {
    icon: PlugsIcon,
    hint: "Para de sincronizar esta loja; os anúncios continuam no marketplace",
  },
  /** The supplier's tabs: orders and products share the reseller's icons (same function). */
  supplierHome: {
    icon: HouseIcon,
    hint: "O que precisa de você hoje: pedidos para aceitar e despachar",
  },
  supplierOrders: { icon: ShoppingBagIcon, hint: "Todos os pedidos dos revendedores, por etapa" },
  supplierProducts: { icon: PackageIcon, hint: "Seus produtos, estoque e o que está em análise" },
  importProducts: { icon: FileArrowUpIcon, hint: "Cadastrar ou atualizar produtos por planilha" },
  performance: { icon: GaugeIcon, hint: "Prazos, cancelamentos e notas que os revendedores veem" },
  brand: { icon: PaletteIcon, hint: "Logo e cores que aparecem para os revendedores" },
  /** Time left before a deadline; once it passes, `overdue` takes over. */
  deadline: { icon: ClockIcon },
  createProduct: { icon: PlusIcon, hint: "Cadastrar um produto novo, passo a passo" },
  /** Sends the photo straight to the cover spot: a star, not an arrow that reads as "move up one". */
  setCover: { icon: StarIcon, hint: "Usar esta imagem como capa do anúncio" },
  removeImage: { icon: TrashIcon, hint: "Remover esta imagem do produto" },
  /** Saves a file the page made (model, guide, failed rows); exporting a report is `exportReport`. */
  downloadFile: { icon: DownloadSimpleIcon },
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
  lastSync: "Última vez que o SellBridge atualizou estoque e preço nesta loja",
  lastOrderPing: "Última vez que o marketplace avisou de um pedido novo",
  storeListings: "Quantos produtos estão publicados nesta loja",
  notASale: "Ainda não pago, cancelado ou devolvido: não conta na receita nem no lucro",
  orderStore: "Loja do revendedor onde o pedido foi feito",
  overdueDeadline: "O prazo já passou; avance a etapa ou registre uma ocorrência",
  openDeadline: "Tempo que falta antes de o prazo vencer",
  rejectedProduct: "A equipe do SellBridge pediu ajustes; abra para ver o motivo",
  healthLevel: "Cor geral do seu desempenho; vermelho quando alguma métrica passou do limite",
  fees: "Taxas do marketplace e do SellBridge sobre a venda",
  completeness: "Quanto do cadastro está preenchido; produtos completos vendem mais",
  blockingPublish: "Faltam itens obrigatórios: o produto não pode ser publicado",
  canImprove: "Já pode ser publicado, mas fotos e detalhes extras ajudam a vender",
  completeListing: "Cadastro completo: tem tudo o que o anúncio precisa",
  blockingIssues: "Sem estes itens o produto não pode ser publicado",
  improvementIssues: "Opcionais, mas deixam o anúncio mais completo e vendem mais",
  stepPending: "Itens desta etapa que impedem publicar",
  autosave: "Cada alteração é salva sozinha; não precisa de botão Salvar",
  productCode: "Código que você usa para identificar o produto no seu estoque",
  failedRows: "Linhas que não entram; veja o motivo na tabela abaixo",
  accountHealth: "Só você vê: a cor sai dos prazos, cancelamentos e notas dos seus pedidos",
  publicScore: "O que os revendedores veem ao escolher fornecedor, pelas avaliações",
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
/** What the supplier's next-step button does, keyed by the status it leads to. */
export const SUPPLIER_NEXT_STEP_HINTS: Readonly<Record<string, string>> = {
  accepted: "Confirma que você vai atender este pedido",
  picking: "Marca que você começou a separar o pedido",
  ready: "Marca que o pedido está embalado e pronto para despachar",
  shipped: "Abre o pedido para informar a transportadora e o rastreio",
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
  batchAccept: "Marque para aceitar vários pedidos de uma vez",
  viewOrder: "Ver os dados, o histórico e os documentos do pedido",
  rateSupplier: "Dar uma nota ao fornecedor por este pedido; ajuda outros revendedores",
  editReview: "Mudar a nota ou o comentário que você deu",
  storeActions: "Ver a saúde da loja, publicar, trocar fornecedor ou desconectar",
  fixProduct: "Abre o cadastro direto no que precisa corrigir",
  editProduct: "Abre o cadastro do produto",
  submitBlocked: "Corrija os itens em “Impede publicar” para enviar",
  downloadTemplate: "Planilha vazia com as colunas certas, pronta para preencher",
  downloadGuide: "Lista do que cada coluna aceita, com exemplos",
  downloadErrors: "Só as linhas com erro, para corrigir e enviar de novo",
  importNeedsChoice: "Marque a caixa acima para importar só as linhas válidas",
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
  "/fornecedor/painel": "supplierHome",
  "/fornecedor/painel/pedidos": "supplierOrders",
  "/fornecedor/painel/produtos": "supplierProducts",
  "/fornecedor/painel/importar": "importProducts",
  "/fornecedor/painel/desempenho": "performance",
  "/fornecedor/painel/marca": "brand",
};
