import {
  BellIcon,
  HeadsetIcon,
  ListIcon,
  MagnifyingGlassIcon,
  MegaphoneSimpleIcon,
  PackageIcon,
  ShoppingBagIcon,
  SquaresFourIcon,
  StorefrontIcon,
  WalletIcon,
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
} as const satisfies Record<string, ActionIcon>;

export type ActionIconName = keyof typeof ACTION_ICONS;

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
